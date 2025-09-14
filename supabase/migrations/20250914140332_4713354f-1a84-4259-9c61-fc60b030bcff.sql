-- Criação da nova tabela para telefones autorizados por conta
CREATE TABLE public.whatsapp_telefones_autorizados (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    usuario_id UUID NOT NULL,
    numero_whatsapp VARCHAR(15) NOT NULL,
    tipo VARCHAR(20) NOT NULL DEFAULT 'extra', -- 'principal' ou 'extra'
    verificado BOOLEAN NOT NULL DEFAULT false,
    codigo_verificacao VARCHAR(6),
    data_codigo TIMESTAMP WITH TIME ZONE,
    api_provider VARCHAR(50) DEFAULT 'z-api',
    ativo BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(usuario_id, numero_whatsapp),
    -- Garantir que só existe 1 telefone principal por usuário
    UNIQUE(usuario_id, tipo) DEFERRABLE INITIALLY DEFERRED
);

-- Habilitar RLS
ALTER TABLE public.whatsapp_telefones_autorizados ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Usuários podem gerenciar seus telefones"
ON public.whatsapp_telefones_autorizados
FOR ALL
USING (auth.uid() = usuario_id)
WITH CHECK (auth.uid() = usuario_id);

-- Sistema pode acessar para validação no webhook
CREATE POLICY "Sistema pode validar telefones autorizados"
ON public.whatsapp_telefones_autorizados
FOR SELECT
USING (verificado = true AND ativo = true);

-- Migrar dados existentes da tabela whatsapp_configuracoes
INSERT INTO public.whatsapp_telefones_autorizados (
    usuario_id,
    numero_whatsapp,
    tipo,
    verificado,
    codigo_verificacao,
    data_codigo,
    api_provider,
    ativo,
    created_at,
    updated_at
)
SELECT 
    usuario_id,
    numero_whatsapp,
    'principal',
    verificado,
    codigo_verificacao,
    data_codigo,
    api_provider,
    ativo,
    created_at,
    updated_at
FROM public.whatsapp_configuracoes
WHERE numero_whatsapp IS NOT NULL;

-- Função para garantir máximo de 3 telefones por usuário
CREATE OR REPLACE FUNCTION public.check_max_telefones_por_usuario()
RETURNS TRIGGER AS $$
BEGIN
    -- Verificar se já existem 3 telefones para este usuário
    IF (SELECT COUNT(*) FROM public.whatsapp_telefones_autorizados 
        WHERE usuario_id = NEW.usuario_id AND ativo = true) >= 3 THEN
        RAISE EXCEPTION 'Máximo de 3 telefones autorizados por usuário';
    END IF;
    
    -- Se está inserindo um telefone principal, verificar se já existe um
    IF NEW.tipo = 'principal' THEN
        IF (SELECT COUNT(*) FROM public.whatsapp_telefones_autorizados 
            WHERE usuario_id = NEW.usuario_id AND tipo = 'principal' AND ativo = true AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)) > 0 THEN
            RAISE EXCEPTION 'Já existe um telefone principal para este usuário';
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para validar máximo de telefones
CREATE TRIGGER trigger_check_max_telefones
    BEFORE INSERT OR UPDATE ON public.whatsapp_telefones_autorizados
    FOR EACH ROW EXECUTE FUNCTION public.check_max_telefones_por_usuario();

-- Função para atualizar timestamps
CREATE OR REPLACE FUNCTION public.update_whatsapp_telefones_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para atualizar timestamps
CREATE TRIGGER trigger_update_whatsapp_telefones_updated_at
    BEFORE UPDATE ON public.whatsapp_telefones_autorizados
    FOR EACH ROW EXECUTE FUNCTION public.update_whatsapp_telefones_updated_at();