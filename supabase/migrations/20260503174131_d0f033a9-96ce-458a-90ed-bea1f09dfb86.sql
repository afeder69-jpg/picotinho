
-- Fase 1: flag para identificar candidatos que ainda precisam de IA
ALTER TABLE public.produtos_candidatos_normalizacao
  ADD COLUMN IF NOT EXISTS precisa_ia boolean NOT NULL DEFAULT false;

-- Marcar todos os 482 órfãos atuais como precisa_ia=true
UPDATE public.produtos_candidatos_normalizacao
SET precisa_ia = true
WHERE status = 'pendente'
  AND confianca_ia = 0
  AND nome_padrao_sugerido IS NULL;

CREATE INDEX IF NOT EXISTS ix_candidatos_precisa_ia
  ON public.produtos_candidatos_normalizacao (precisa_ia)
  WHERE precisa_ia = true;

-- Tabela de logging de erros da IA (Fase NOVO do plano)
CREATE TABLE IF NOT EXISTS public.ia_normalizacao_erros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidato_id uuid REFERENCES public.produtos_candidatos_normalizacao(id) ON DELETE CASCADE,
  texto_original text,
  tipo_erro text NOT NULL,
  http_status int,
  modelo text,
  mensagem text,
  payload_enviado jsonb,
  resposta_bruta jsonb,
  tentativa int NOT NULL DEFAULT 1,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_ia_erros_tipo
  ON public.ia_normalizacao_erros (tipo_erro, criado_em DESC);

ALTER TABLE public.ia_normalizacao_erros ENABLE ROW LEVEL SECURITY;

-- Apenas masters podem ler logs de erro IA
DROP POLICY IF EXISTS "Masters podem ler erros IA" ON public.ia_normalizacao_erros;
CREATE POLICY "Masters podem ler erros IA"
  ON public.ia_normalizacao_erros
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'master'::app_role));

-- Service role insere via edge functions (bypass RLS)
