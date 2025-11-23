-- ========================================
-- CORREÇÃO COMPLETA NA RAIZ DO PROBLEMA
-- ========================================

-- PARTE 1: Limpar candidatos incorretos e órfãos dos 3 produtos problemáticos
DELETE FROM produtos_candidatos_normalizacao 
WHERE id IN (
  'bf8fda22-c24f-4e76-beb7-dfd15a0e8d79',  -- CREME DE LEITE (candidato órfão)
  'dad2cc87-d766-4cf3-9e71-bc7e3b86feef',  -- MANTEIGA (candidato órfão)
  '77e38ebb-e7da-42d9-a856-8e4acf7d0ad9'   -- GELATINA FRAMBOESA (normalização INCORRETA)
);

-- PARTE 2: Limpar vínculos incorretos no estoque (resetar para reprocessamento)
UPDATE estoque_app 
SET produto_candidato_id = NULL,
    produto_master_id = NULL,
    sku_global = NULL
WHERE id IN (
  'ab0aa877-0b07-4b65-a1f4-247d8ef762df',  -- CREME DE LEITE
  '976c1861-b6da-419b-875f-97552a77a83e',  -- MANTEIGA
  '97cd0255-1973-46ff-a41a-ecaff54e4987'   -- GELATINA
);

-- PARTE 3: Adicionar CASCADE DELETE para prevenir candidatos órfãos no futuro
-- Quando uma nota for deletada, deletar automaticamente seus candidatos
ALTER TABLE produtos_candidatos_normalizacao 
DROP CONSTRAINT IF EXISTS produtos_candidatos_normalizacao_nota_imagem_id_fkey;

ALTER TABLE produtos_candidatos_normalizacao 
ADD CONSTRAINT produtos_candidatos_normalizacao_nota_imagem_id_fkey 
FOREIGN KEY (nota_imagem_id) 
REFERENCES notas_imagens(id) 
ON DELETE CASCADE;

-- PARTE 4: Criar função de limpeza automática de candidatos órfãos (sem estoque vinculado)
CREATE OR REPLACE FUNCTION limpar_candidatos_orfaos()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  total_removidos integer;
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

-- Executar limpeza inicial
SELECT limpar_candidatos_orfaos();