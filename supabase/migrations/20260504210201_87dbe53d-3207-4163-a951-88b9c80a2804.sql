ALTER TABLE public.produtos_candidatos_normalizacao
  ADD COLUMN IF NOT EXISTS resposta_bruta JSONB;

UPDATE public.produtos_candidatos_normalizacao
SET status = 'pendente_revisao',
    precisa_ia = false,
    motivo_bloqueio = COALESCE(motivo_bloqueio, 'legado_sem_motivo'),
    updated_at = now()
WHERE status = 'pendente'
  AND precisa_ia = true
  AND motivo_bloqueio IS NULL
  AND resposta_bruta IS NOT NULL;