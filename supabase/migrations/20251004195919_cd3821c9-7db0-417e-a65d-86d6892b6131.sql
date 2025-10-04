-- ==========================================
-- ETAPA 1: Criar tabela open_food_facts_staging (sem policies)
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

-- ==========================================
-- ETAPA 2: Normalizar dados existentes (UPPERCASE)
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

-- Normalizar precos_atuais (remover duplicatas primeiro)
WITH ranked_precos AS (
  SELECT 
    id,
    ROW_NUMBER() OVER (
      PARTITION BY UPPER(TRIM(produto_nome)), estabelecimento_cnpj 
      ORDER BY data_atualizacao DESC
    ) as rn
  FROM public.precos_atuais
)
DELETE FROM public.precos_atuais
WHERE id IN (
  SELECT id FROM ranked_precos WHERE rn > 1
);

-- Agora normalizar
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