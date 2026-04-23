CREATE TABLE IF NOT EXISTS public.normalizacao_retroativa_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing','completed','failed')),
  total integer NOT NULL DEFAULT 0,
  processadas integer NOT NULL DEFAULT 0,
  atualizadas integer NOT NULL DEFAULT 0,
  normalizacoes_aplicadas jsonb NOT NULL DEFAULT '[]'::jsonb,
  erro text,
  criado_por uuid,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_norm_retro_jobs_started_at ON public.normalizacao_retroativa_jobs (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_norm_retro_jobs_status ON public.normalizacao_retroativa_jobs (status);

ALTER TABLE public.normalizacao_retroativa_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Masters podem ver jobs de normalizacao retroativa"
ON public.normalizacao_retroativa_jobs
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'master'::app_role));

CREATE TRIGGER trg_norm_retro_jobs_updated_at
BEFORE UPDATE ON public.normalizacao_retroativa_jobs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();