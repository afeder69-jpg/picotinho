-- Criar tabela para gerenciar estado de conversas WhatsApp
CREATE TABLE IF NOT EXISTS public.whatsapp_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  usuario_id UUID NOT NULL,
  remetente TEXT NOT NULL,
  estado TEXT NOT NULL, -- 'aguardando_preco', 'aguardando_categoria', null
  produto_id UUID,
  produto_nome TEXT,
  contexto JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '1 hour')
);

-- Habilitar RLS
ALTER TABLE public.whatsapp_sessions ENABLE ROW LEVEL SECURITY;

-- Criar políticas RLS
CREATE POLICY "Usuários podem gerenciar suas sessões WhatsApp" 
ON public.whatsapp_sessions 
FOR ALL 
USING (auth.uid() = usuario_id)
WITH CHECK (auth.uid() = usuario_id);

-- Criar função para limpeza automática de sessões expiradas
CREATE OR REPLACE FUNCTION public.limpar_sessoes_expiradas()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM public.whatsapp_sessions 
  WHERE expires_at < now();
END;
$$;

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION public.update_whatsapp_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_whatsapp_sessions_updated_at
    BEFORE UPDATE ON public.whatsapp_sessions
    FOR EACH ROW
    EXECUTE FUNCTION public.update_whatsapp_sessions_updated_at();