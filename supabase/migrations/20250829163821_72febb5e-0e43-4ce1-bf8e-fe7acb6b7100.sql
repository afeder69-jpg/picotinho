-- Criar tabela produtos_normalizados para futuro uso
CREATE TABLE IF NOT EXISTS public.produtos_normalizados (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome_padrao TEXT NOT NULL,
  categoria TEXT NOT NULL,
  unidade_medida TEXT NOT NULL DEFAULT 'unidade',
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Criar tabela configuracoes_usuario para configurações futuras
CREATE TABLE IF NOT EXISTS public.configuracoes_usuario (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  usuario_id UUID NOT NULL,
  raio_busca_km NUMERIC NOT NULL DEFAULT 5.0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(usuario_id)
);

-- Adicionar colunas que podem estar faltando na tabela mercados
ALTER TABLE public.mercados 
ADD COLUMN IF NOT EXISTS latitude NUMERIC,
ADD COLUMN IF NOT EXISTS longitude NUMERIC,
ADD COLUMN IF NOT EXISTS bairro TEXT;

-- Verificar se tabela notas_fiscais tem as colunas necessárias
ALTER TABLE public.notas_fiscais 
ADD COLUMN IF NOT EXISTS status_processamento TEXT DEFAULT 'processada',
ADD COLUMN IF NOT EXISTS mercado_id UUID,
ADD COLUMN IF NOT EXISTS hora_compra TIME;

-- Verificar se tabela itens_nota tem as colunas necessárias  
ALTER TABLE public.itens_nota
ADD COLUMN IF NOT EXISTS descricao_normalizada TEXT,
ADD COLUMN IF NOT EXISTS produto_normalizado_id UUID;

-- Enable RLS nas novas tabelas
ALTER TABLE public.produtos_normalizados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.configuracoes_usuario ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para produtos_normalizados (todos podem ler, sistema insere)
CREATE POLICY "Todos podem ler produtos normalizados" 
ON public.produtos_normalizados 
FOR SELECT 
USING (true);

CREATE POLICY "Sistema pode inserir produtos normalizados" 
ON public.produtos_normalizados 
FOR INSERT 
WITH CHECK (true);

-- Políticas RLS para configuracoes_usuario
CREATE POLICY "Usuários podem ler suas configurações" 
ON public.configuracoes_usuario 
FOR SELECT 
USING (auth.uid() = usuario_id);

CREATE POLICY "Usuários podem inserir suas configurações" 
ON public.configuracoes_usuario 
FOR INSERT 
WITH CHECK (auth.uid() = usuario_id);

CREATE POLICY "Usuários podem atualizar suas configurações" 
ON public.configuracoes_usuario 
FOR UPDATE 
USING (auth.uid() = usuario_id);

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_produtos_normalizados_updated_at
    BEFORE UPDATE ON public.produtos_normalizados
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_configuracoes_usuario_updated_at
    BEFORE UPDATE ON public.configuracoes_usuario
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();