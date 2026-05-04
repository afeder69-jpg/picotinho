-- 1) Ampliar CHECK constraint de status para incluir 'pendente_revisao'
ALTER TABLE public.produtos_candidatos_normalizacao
  DROP CONSTRAINT IF EXISTS produtos_candidatos_normalizacao_status_check;

ALTER TABLE public.produtos_candidatos_normalizacao
  ADD CONSTRAINT produtos_candidatos_normalizacao_status_check
  CHECK (status = ANY (ARRAY[
    'pendente'::text,
    'pendente_revisao'::text,
    'aprovado'::text,
    'rejeitado'::text,
    'auto_aprovado'::text
  ]));

-- 2) Limpeza retroativa: candidatos em "limbo"
--    (status='pendente', precisa_ia=false, motivo_bloqueio IS NULL)
--    Causados pelo bug do UPDATE separado de motivo_bloqueio no fluxo anti-duplicata.
--    Movidos para 'pendente_revisao' com motivo 'legado_sem_motivo' para sair da fila
--    de "Aguardando IA" e ficar disponíveis para auditoria/revisão humana.
UPDATE public.produtos_candidatos_normalizacao
SET
  status = 'pendente_revisao',
  motivo_bloqueio = 'legado_sem_motivo',
  updated_at = now()
WHERE status = 'pendente'
  AND precisa_ia = false
  AND motivo_bloqueio IS NULL;