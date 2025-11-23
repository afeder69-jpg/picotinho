-- Habilitar realtime na tabela produtos_candidatos_normalizacao
-- para notificar o frontend quando produtos são normalizados

-- 1. Configurar REPLICA IDENTITY para capturar todas as mudanças
ALTER TABLE produtos_candidatos_normalizacao REPLICA IDENTITY FULL;

-- 2. Adicionar tabela à publicação realtime
ALTER PUBLICATION supabase_realtime ADD TABLE produtos_candidatos_normalizacao;