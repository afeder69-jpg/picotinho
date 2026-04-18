-- Adicionar colunas de status de processamento
ALTER TABLE public.notas_imagens
  ADD COLUMN IF NOT EXISTS status_processamento TEXT,
  ADD COLUMN IF NOT EXISTS erro_mensagem TEXT,
  ADD COLUMN IF NOT EXISTS tentativas_finalizacao INTEGER NOT NULL DEFAULT 0;

-- Backfill com base nos campos atuais
UPDATE public.notas_imagens
SET status_processamento = CASE
  WHEN excluida = true THEN 'erro'
  WHEN processada = true THEN 'processada'
  WHEN dados_extraidos IS NOT NULL THEN 'aguardando_estoque'
  ELSE 'pendente'
END
WHERE status_processamento IS NULL;

-- Índice para o cron de retry localizar notas presas
CREATE INDEX IF NOT EXISTS idx_notas_imagens_status_proc
  ON public.notas_imagens (status_processamento, processing_started_at)
  WHERE status_processamento IN ('pendente', 'aguardando_estoque', 'processando');
