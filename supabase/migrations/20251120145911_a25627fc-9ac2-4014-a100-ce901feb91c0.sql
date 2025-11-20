-- FASE 1: Adicionar campo de link provisório para produtos aguardando normalização
-- Este campo vincula temporariamente produtos no estoque aos candidatos de normalização pendentes

ALTER TABLE estoque_app 
ADD COLUMN produto_candidato_id UUID 
REFERENCES produtos_candidatos_normalizacao(id) 
ON DELETE SET NULL;

-- Índice para performance nas buscas e updates
CREATE INDEX idx_estoque_app_candidato 
ON estoque_app(produto_candidato_id) 
WHERE produto_candidato_id IS NOT NULL;

-- Comentário explicativo
COMMENT ON COLUMN estoque_app.produto_candidato_id IS 
'Link temporário para produtos aguardando normalização manual (confiança IA < 90%). 
Quando aprovado manualmente, os dados são transferidos para produto_master_id e este campo é limpo.';