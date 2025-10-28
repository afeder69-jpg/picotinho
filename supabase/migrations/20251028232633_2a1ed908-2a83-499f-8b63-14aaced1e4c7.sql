-- =====================================================
-- Adicionar política RLS de DELETE para produtos_candidatos_normalizacao
-- =====================================================

-- Remover política antiga, se existir
DROP POLICY IF EXISTS "Masters podem deletar candidatos" ON produtos_candidatos_normalizacao;

-- Criar política que permite Masters deletarem qualquer candidato
CREATE POLICY "Masters podem deletar candidatos"
ON produtos_candidatos_normalizacao
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'master'::app_role));

-- Comentário para documentação
COMMENT ON POLICY "Masters podem deletar candidatos" ON produtos_candidatos_normalizacao IS 
'Permite que usuários com role master deletem candidatos de normalização de qualquer nota';