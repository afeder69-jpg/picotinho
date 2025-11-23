-- PARTE 1: Limpeza Imediata de Candidatos Órfãos
-- Deletar candidatos cujas notas não existem mais
DELETE FROM produtos_candidatos_normalizacao
WHERE nota_imagem_id IS NOT NULL
  AND nota_imagem_id NOT IN (
    SELECT id FROM notas_imagens
  );

-- Resetar contadores das notas incompletas
UPDATE notas_imagens
SET normalizada = false,
    tentativas_normalizacao = 0
WHERE processada = true
  AND normalizada = false
  AND tentativas_normalizacao > 0;

-- PARTE 2: Adicionar ON DELETE CASCADE à FK
-- Remover constraint antiga
ALTER TABLE produtos_candidatos_normalizacao
DROP CONSTRAINT IF EXISTS produtos_candidatos_normalizacao_nota_imagem_id_fkey;

-- Recriar constraint COM CASCADE
ALTER TABLE produtos_candidatos_normalizacao
ADD CONSTRAINT produtos_candidatos_normalizacao_nota_imagem_id_fkey
FOREIGN KEY (nota_imagem_id)
REFERENCES notas_imagens(id)
ON DELETE CASCADE;

-- PARTE 4: Função de Limpeza Preventiva
CREATE OR REPLACE FUNCTION limpar_candidatos_orfaos()
RETURNS INTEGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  total_removidos INTEGER;
BEGIN
  -- Deletar candidatos que não têm mais nenhum item no estoque vinculado
  WITH candidatos_orfaos AS (
    DELETE FROM produtos_candidatos_normalizacao pcn
    WHERE pcn.nota_imagem_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM estoque_app e 
      WHERE e.nota_id = pcn.nota_imagem_id 
      AND e.produto_nome = pcn.texto_original
    )
    RETURNING id
  )
  SELECT COUNT(*) INTO total_removidos FROM candidatos_orfaos;
  
  RAISE NOTICE 'Candidatos órfãos removidos: %', total_removidos;
  RETURN total_removidos;
END;
$$;

COMMENT ON FUNCTION limpar_candidatos_orfaos() IS 
'Remove candidatos órfãos cujas notas foram excluídas ou itens de estoque não existem mais. Executar periodicamente.';