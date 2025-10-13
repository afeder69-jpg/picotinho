-- Adicionar coluna de tracking de item em produtos_candidatos_normalizacao
ALTER TABLE produtos_candidatos_normalizacao 
ADD COLUMN IF NOT EXISTS nota_item_hash TEXT;

-- Adicionar colunas de tracking em notas_imagens
ALTER TABLE notas_imagens
ADD COLUMN IF NOT EXISTS normalizada_em TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS produtos_normalizados INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS tentativas_normalizacao INTEGER DEFAULT 0;

-- Criar índice único para prevenir duplicatas
CREATE UNIQUE INDEX IF NOT EXISTS idx_candidato_nota_item_unique
ON produtos_candidatos_normalizacao(nota_imagem_id, nota_item_hash)
WHERE nota_imagem_id IS NOT NULL AND nota_item_hash IS NOT NULL;

-- Criar tabela de auditoria de falhas
CREATE TABLE IF NOT EXISTS normalizacao_falhas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nota_imagem_id UUID REFERENCES notas_imagens(id) ON DELETE CASCADE,
  texto_original TEXT NOT NULL,
  erro_mensagem TEXT,
  erro_detalhes JSONB,
  tentativas INTEGER DEFAULT 1,
  resolvido BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para buscar falhas não resolvidas
CREATE INDEX IF NOT EXISTS idx_normalizacao_falhas_nao_resolvidas
ON normalizacao_falhas(resolvido, nota_imagem_id)
WHERE resolvido = FALSE;

-- RLS para normalizacao_falhas
ALTER TABLE normalizacao_falhas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Masters podem ver falhas de normalização"
ON normalizacao_falhas
FOR SELECT
USING (has_role(auth.uid(), 'master'::app_role));

CREATE POLICY "Sistema pode inserir falhas"
ON normalizacao_falhas
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Sistema pode atualizar falhas"
ON normalizacao_falhas
FOR UPDATE
USING (true);