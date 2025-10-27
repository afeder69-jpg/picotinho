-- Adicionar tipo_consulta para diferenciar consultas resumidas vs completas
ALTER TABLE nfce_cache_infosimples 
ADD COLUMN IF NOT EXISTS tipo_consulta TEXT DEFAULT 'completa';

-- Dropar constraint existente (não apenas índice)
ALTER TABLE nfce_cache_infosimples 
DROP CONSTRAINT IF EXISTS nfce_cache_infosimples_chave_nfce_key;

-- Criar índice único para chave + tipo de consulta
CREATE UNIQUE INDEX IF NOT EXISTS nfce_cache_infosimples_chave_tipo_idx 
ON nfce_cache_infosimples(chave_nfce, tipo_consulta);

-- Comentário explicativo
COMMENT ON COLUMN nfce_cache_infosimples.tipo_consulta IS 'Tipo de consulta realizada: completa ou resumida';
COMMENT ON TABLE nfce_cache_infosimples IS 'Cache de consultas à API InfoSimples. Endpoint completa retorna preços finais COM desconto aplicado.';