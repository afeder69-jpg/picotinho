-- ================== OTIMIZAÇÕES PARA ALTO VOLUME ==================
-- Criação de índices para melhorar performance com centenas de usuários e milhares de notas

-- 1. Índice composto para estoque_app (consultas mais rápidas por usuário)
CREATE INDEX IF NOT EXISTS idx_estoque_app_user_produto 
ON estoque_app (user_id, produto_nome);

-- 2. Índice para busca por nota_id no estoque_app (limpeza mais rápida)
CREATE INDEX IF NOT EXISTS idx_estoque_app_nota 
ON estoque_app (nota_id, user_id);

-- 3. Índice para notas_imagens por usuário e status processada
CREATE INDEX IF NOT EXISTS idx_notas_imagens_user_processada 
ON notas_imagens (usuario_id, processada, created_at DESC);

-- 4. Índice para precos_atuais por estabelecimento
CREATE INDEX IF NOT EXISTS idx_precos_atuais_estabelecimento 
ON precos_atuais (estabelecimento_cnpj, data_atualizacao DESC);

-- 5. Índice GIN para busca em dados_extraidos JSONB
CREATE INDEX IF NOT EXISTS idx_notas_imagens_dados_extraidos_gin 
ON notas_imagens USING GIN (dados_extraidos);

-- 6. Índice para otimizar consolidação de estoque
CREATE INDEX IF NOT EXISTS idx_estoque_app_created_at 
ON estoque_app (user_id, created_at DESC);

-- 7. Função para limpeza automática de registros antigos (manutenção)
CREATE OR REPLACE FUNCTION limpar_dados_antigos()
RETURNS void AS $$
BEGIN
  -- Remover notas não processadas com mais de 30 dias
  DELETE FROM notas_imagens 
  WHERE processada = false 
    AND created_at < NOW() - INTERVAL '30 days';
  
  -- Log da limpeza
  RAISE NOTICE 'Limpeza automática executada em %', NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Política de RLS otimizada para estoque_app (evitar scan completo)
DROP POLICY IF EXISTS "Usuários podem visualizar seu estoque" ON estoque_app;
CREATE POLICY "Usuários podem visualizar seu estoque optimized" 
ON estoque_app FOR SELECT 
USING (auth.uid() = user_id);

-- 9. Constraints para garantir integridade dos dados
ALTER TABLE estoque_app 
ADD CONSTRAINT check_quantidade_positiva 
CHECK (quantidade >= 0);

ALTER TABLE estoque_app 
ADD CONSTRAINT check_preco_positivo 
CHECK (preco_unitario_ultimo IS NULL OR preco_unitario_ultimo >= 0);

-- 10. View materializada para estatísticas de performance (opcional)
CREATE MATERIALIZED VIEW IF NOT EXISTS estoque_stats AS
SELECT 
  user_id,
  COUNT(*) as total_produtos,
  COUNT(DISTINCT categoria) as total_categorias,
  SUM(quantidade * COALESCE(preco_unitario_ultimo, 0)) as valor_total_estoque,
  MAX(updated_at) as ultima_atualizacao
FROM estoque_app 
GROUP BY user_id;

-- Índice para a view materializada
CREATE UNIQUE INDEX IF NOT EXISTS idx_estoque_stats_user 
ON estoque_stats (user_id);

-- Função para atualizar estatísticas
CREATE OR REPLACE FUNCTION refresh_estoque_stats()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY estoque_stats;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;