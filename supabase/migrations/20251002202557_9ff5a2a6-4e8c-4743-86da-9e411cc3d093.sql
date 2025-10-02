-- =====================================================
-- FASE 1: ESTRUTURA DE UNIDADE BASE (FINAL)
-- =====================================================

-- 1.1. Criar tabela unidades_conversao
CREATE TABLE IF NOT EXISTS unidades_conversao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade_origem text NOT NULL,
  unidade_destino text NOT NULL,
  fator_conversao numeric(12,6) NOT NULL,
  categoria_aplicavel text,
  ativo boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Seed inicial
INSERT INTO unidades_conversao (unidade_origem, unidade_destino, fator_conversao, categoria_aplicavel) VALUES
  ('L', 'ml', 1000, 'BEBIDAS'),
  ('kg', 'g', 1000, 'ALIMENTOS'),
  ('kg', 'g', 1000, 'HIGIENE'),
  ('kg', 'g', 1000, 'LIMPEZA')
ON CONFLICT DO NOTHING;

-- 1.2. Adicionar campos em produtos_master_global
ALTER TABLE produtos_master_global
  ADD COLUMN IF NOT EXISTS qtd_base numeric(12,6),
  ADD COLUMN IF NOT EXISTS unidade_base text,
  ADD COLUMN IF NOT EXISTS categoria_unidade text;

-- 1.3. Adicionar campos em produtos_candidatos_normalizacao
ALTER TABLE produtos_candidatos_normalizacao
  ADD COLUMN IF NOT EXISTS qtd_base_sugerida numeric(12,6),
  ADD COLUMN IF NOT EXISTS unidade_base_sugerida text,
  ADD COLUMN IF NOT EXISTS categoria_unidade_sugerida text;

-- 1.4. Adicionar campos faltantes em estoque_app
ALTER TABLE estoque_app
  ADD COLUMN IF NOT EXISTS unidade_base text,
  ADD COLUMN IF NOT EXISTS preco_por_unidade_base numeric(12,6);

COMMENT ON COLUMN estoque_app.qtd_base IS 'Quantidade na unidade base (ml para líquidos, g para sólidos)';
COMMENT ON COLUMN estoque_app.unidade_base IS 'Unidade base normalizada (ml, g, ou un)';
COMMENT ON COLUMN estoque_app.preco_por_unidade_base IS 'Preço por unidade base (R$/ml ou R$/g) com 6 casas decimais';

-- 1.5. Adicionar campos em precos_atuais
ALTER TABLE precos_atuais
  ADD COLUMN IF NOT EXISTS preco_por_unidade_base numeric(12,6);

-- 1.6. Adicionar campos em precos_atuais_usuario
ALTER TABLE precos_atuais_usuario
  ADD COLUMN IF NOT EXISTS preco_por_unidade_base numeric(12,6);

-- 1.7. Criar função para calcular unidade base
CREATE OR REPLACE FUNCTION calcular_unidade_base(
  qtd_valor_input numeric,
  qtd_unidade_input text
) RETURNS jsonb AS $$
DECLARE
  resultado jsonb;
  qtd_base_calc numeric;
  unidade_base_calc text;
  categoria_unidade_calc text;
BEGIN
  -- Converter L → ml
  IF UPPER(qtd_unidade_input) IN ('L', 'LITRO', 'LITROS') THEN
    qtd_base_calc := qtd_valor_input * 1000;
    unidade_base_calc := 'ml';
    categoria_unidade_calc := 'VOLUME';
  
  -- Converter kg → g
  ELSIF UPPER(qtd_unidade_input) IN ('KG', 'KILO', 'KILOS') THEN
    qtd_base_calc := qtd_valor_input * 1000;
    unidade_base_calc := 'g';
    categoria_unidade_calc := 'PESO';
  
  -- ml (já é base)
  ELSIF UPPER(qtd_unidade_input) IN ('ML', 'MILILITRO', 'MILILITROS') THEN
    qtd_base_calc := qtd_valor_input;
    unidade_base_calc := 'ml';
    categoria_unidade_calc := 'VOLUME';
  
  -- g (já é base)
  ELSIF UPPER(qtd_unidade_input) IN ('G', 'GRAMA', 'GRAMAS') THEN
    qtd_base_calc := qtd_valor_input;
    unidade_base_calc := 'g';
    categoria_unidade_calc := 'PESO';
  
  -- Unidade (mantém como está)
  ELSE
    qtd_base_calc := qtd_valor_input;
    unidade_base_calc := COALESCE(qtd_unidade_input, 'un');
    categoria_unidade_calc := 'UNIDADE';
  END IF;
  
  resultado := jsonb_build_object(
    'qtd_base', qtd_base_calc,
    'unidade_base', unidade_base_calc,
    'categoria_unidade', categoria_unidade_calc
  );
  
  RETURN resultado;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 1.8. Criar função para calcular preço por unidade base
CREATE OR REPLACE FUNCTION calcular_preco_por_unidade_base(
  preco_unitario numeric,
  qtd_base_input numeric,
  unidade_base_input text
) RETURNS numeric AS $$
BEGIN
  IF qtd_base_input IS NULL OR qtd_base_input = 0 THEN
    RETURN NULL;
  END IF;
  
  -- Retorna preço/ml ou preço/g com 6 casas decimais
  RETURN ROUND(preco_unitario / qtd_base_input, 6);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Comentários explicativos
COMMENT ON FUNCTION calcular_unidade_base IS 'Converte qtd_valor + qtd_unidade para unidade base (L→ml, kg→g)';
COMMENT ON FUNCTION calcular_preco_por_unidade_base IS 'Calcula preço por unidade base para comparação (R$/ml ou R$/g)';