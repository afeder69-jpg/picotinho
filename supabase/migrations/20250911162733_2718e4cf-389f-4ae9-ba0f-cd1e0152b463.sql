-- Corrigir problema de duplicata: remover nota problemática que foi excluída mas permaneceu no banco
DELETE FROM notas_imagens WHERE id = 'a44ca106-d7e1-4950-adf6-52d973872eb9';

-- Melhorar a validação de duplicatas: adicionar coluna para marcar notas como logicamente excluídas
ALTER TABLE notas_imagens ADD COLUMN IF NOT EXISTS excluida BOOLEAN DEFAULT false;

-- Índice para otimizar consultas de duplicatas considerando exclusão lógica
CREATE INDEX IF NOT EXISTS idx_notas_imagens_chave_ativa 
ON notas_imagens (
  (dados_extraidos->>'chave_acesso'),
  (dados_extraidos->'compra'->>'chave_acesso')
) 
WHERE processada = true AND excluida = false;