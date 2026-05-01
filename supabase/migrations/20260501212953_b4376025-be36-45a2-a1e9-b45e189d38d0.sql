ALTER TABLE public.notas_imagens
  ADD COLUMN IF NOT EXISTS motivo_pendencia text,
  ADD COLUMN IF NOT EXISTS proxima_tentativa_em timestamptz,
  ADD COLUMN IF NOT EXISTS tentativas_consulta integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS historico_tentativas jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS consulta_finalizada_em timestamptz;

CREATE INDEX IF NOT EXISTS idx_notas_pendente_consulta_proxima
  ON public.notas_imagens (proxima_tentativa_em)
  WHERE status_processamento = 'pendente_consulta';