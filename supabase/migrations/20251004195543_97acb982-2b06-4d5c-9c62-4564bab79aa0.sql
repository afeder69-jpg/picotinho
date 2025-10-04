-- ==========================================
-- ETAPA 1: Criar tabela open_food_facts_staging
-- ==========================================
CREATE TABLE IF NOT EXISTS public.open_food_facts_staging (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_barras TEXT NOT NULL,
  texto_original TEXT NOT NULL,
  dados_brutos JSONB NOT NULL,
  processada BOOLEAN DEFAULT false,
  imagem_url TEXT,
  imagem_path TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_off_staging_processada ON public.open_food_facts_staging(processada);
CREATE INDEX IF NOT EXISTS idx_off_staging_codigo ON public.open_food_facts_staging(codigo_barras);

-- RLS policies
ALTER TABLE public.open_food_facts_staging ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Masters podem ver staging Open Food Facts"
  ON public.open_food_facts_staging
  FOR SELECT
  USING (has_role(auth.uid(), 'master'::app_role));

CREATE POLICY "Sistema pode inserir no staging"
  ON public.open_food_facts_staging
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Sistema pode atualizar staging"
  ON public.open_food_facts_staging
  FOR UPDATE
  USING (true);

-- ==========================================
-- ETAPA 2: Remover duplicatas de precos_atuais
-- ==========================================

-- Remover duplicatas mantendo o mais recente
DELETE FROM public.precos_atuais a
USING public.precos_atuais b
WHERE a.id < b.id
  AND UPPER(TRIM(a.produto_nome)) = UPPER(TRIM(b.produto_nome))
  AND a.estabelecimento_cnpj = b.estabelecimento_cnpj;

-- ==========================================
-- ETAPA 3: Normalizar dados existentes (UPPERCASE)
-- ==========================================

-- Normalizar produtos_master_global
UPDATE public.produtos_master_global
SET 
  nome_padrao = UPPER(TRIM(nome_padrao)),
  nome_base = UPPER(TRIM(nome_base)),
  marca = UPPER(TRIM(marca)),
  categoria = UPPER(TRIM(categoria))
WHERE 
  nome_padrao != UPPER(TRIM(nome_padrao)) OR
  nome_base != UPPER(TRIM(nome_base)) OR
  (marca IS NOT NULL AND marca != UPPER(TRIM(marca))) OR
  categoria != UPPER(TRIM(categoria));

-- Normalizar estoque_app
UPDATE public.estoque_app
SET 
  produto_nome = UPPER(TRIM(produto_nome)),
  nome_base = UPPER(TRIM(nome_base)),
  marca = UPPER(TRIM(marca))
WHERE 
  produto_nome != UPPER(TRIM(produto_nome)) OR
  (nome_base IS NOT NULL AND nome_base != UPPER(TRIM(nome_base))) OR
  (marca IS NOT NULL AND marca != UPPER(TRIM(marca)));

-- Normalizar precos_atuais
UPDATE public.precos_atuais
SET 
  produto_nome = UPPER(TRIM(produto_nome)),
  nome_base = UPPER(TRIM(nome_base)),
  marca = UPPER(TRIM(marca))
WHERE 
  produto_nome != UPPER(TRIM(produto_nome)) OR
  (nome_base IS NOT NULL AND nome_base != UPPER(TRIM(nome_base))) OR
  (marca IS NOT NULL AND marca != UPPER(TRIM(marca)));

-- Normalizar precos_atuais_usuario
UPDATE public.precos_atuais_usuario
SET 
  produto_nome = UPPER(TRIM(produto_nome)),
  nome_base = UPPER(TRIM(nome_base)),
  marca = UPPER(TRIM(marca))
WHERE 
  produto_nome != UPPER(TRIM(produto_nome)) OR
  (nome_base IS NOT NULL AND nome_base != UPPER(TRIM(nome_base))) OR
  (marca IS NOT NULL AND marca != UPPER(TRIM(marca)));