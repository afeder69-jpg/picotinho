-- Consolidar produtos duplicados com diferenças mínimas (acentos, espaços, etc.)
-- Primeiro, criar uma função de normalização avançada
CREATE OR REPLACE FUNCTION normalizar_produto_completo(nome TEXT) 
RETURNS TEXT AS $$
BEGIN
  RETURN UPPER(
    TRIM(
      REGEXP_REPLACE(
        TRANSLATE(
          nome,
          'ÀÁÂÃÄÅàáâãäåÒÓÔÕÖØòóôõöøÈÉÊËèéêëÇçÌÍÎÏìíîïÙÚÛÜùúûüÿÑñ',
          'AAAAAAaaaaaaOOOOOOooooooEEEEeeeeeCcIIIIiiiiUUUUuuuuyNn'
        ),
        '\s+', ' ', 'g'
      )
    )
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Consolidar especificamente os produtos IOGURTE LÍQUIDO/LIQUIDO LACFREE MORANGO
-- Manter o registro com ID mais antigo e somar as quantidades
WITH produtos_similares AS (
  SELECT 
    id,
    produto_nome,
    quantidade,
    preco_unitario_ultimo,
    created_at,
    normalizar_produto_completo(produto_nome) as nome_normalizado,
    ROW_NUMBER() OVER (PARTITION BY normalizar_produto_completo(produto_nome) ORDER BY created_at) as rn
  FROM estoque_app 
  WHERE user_id = 'ae5b5501-7f8a-46da-9cba-b9955a84e697'
  AND UPPER(produto_nome) LIKE '%IOGURTE%LIQUIDO%LACFREE%MORANGO%'
),
consolidacao AS (
  SELECT 
    nome_normalizado,
    MIN(id) as id_manter,
    SUM(quantidade) as quantidade_total,
    MAX(preco_unitario_ultimo) as preco_unitario,
    'IOGURTE LÍQUIDO LACFREE MORANGO' as nome_final
  FROM produtos_similares
  GROUP BY nome_normalizado
)
UPDATE estoque_app 
SET 
  produto_nome = c.nome_final,
  quantidade = c.quantidade_total,
  preco_unitario_ultimo = c.preco_unitario,
  updated_at = now()
FROM consolidacao c
WHERE estoque_app.id = c.id_manter;

-- Remover os produtos duplicados (manter apenas o consolidado)
DELETE FROM estoque_app 
WHERE user_id = 'ae5b5501-7f8a-46da-9cba-b9955a84e697'
AND UPPER(produto_nome) LIKE '%IOGURTE%LIQUIDO%LACFREE%MORANGO%'
AND id NOT IN (
  SELECT MIN(id) 
  FROM estoque_app e2
  WHERE e2.user_id = 'ae5b5501-7f8a-46da-9cba-b9955a84e697'
  AND normalizar_produto_completo(e2.produto_nome) = 'IOGURTE LIQUIDO LACFREE MORANGO'
  GROUP BY normalizar_produto_completo(e2.produto_nome)
);