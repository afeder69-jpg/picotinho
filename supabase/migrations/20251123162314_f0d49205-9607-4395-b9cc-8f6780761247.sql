-- Limpar duplicatas de produtos_candidatos_normalizacao
-- Manter apenas o registro mais recente para cada combinação (nota_imagem_id, texto_original)

DELETE FROM produtos_candidatos_normalizacao
WHERE id NOT IN (
  SELECT DISTINCT ON (nota_imagem_id, texto_original) id
  FROM produtos_candidatos_normalizacao
  ORDER BY nota_imagem_id, texto_original, created_at DESC
);