-- 1) Garantir extensões necessárias (idempotente)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2) Remover job pré-existente com o mesmo nome (idempotência)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cron-notificar-notas-processadas-5min') THEN
    PERFORM cron.unschedule('cron-notificar-notas-processadas-5min');
  END IF;
END $$;

-- 3) Agendar a cada 5 minutos. O secret é resolvido via Vault em cada execução,
--    portanto a coluna cron.job.command armazenará apenas a REFERÊNCIA ao Vault.
SELECT cron.schedule(
  'cron-notificar-notas-processadas-5min',
  '*/5 * * * *',
  $job$
  SELECT net.http_post(
    url     := 'https://mjsbwrtegorjxcepvrik.supabase.co/functions/v1/cron-notificar-notas-processadas',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'CRON_NOTIFICACOES_SECRET' LIMIT 1)
    ),
    body    := jsonb_build_object('trigger','cron','time', now())
  ) AS request_id;
  $job$
);

-- 4) Remover as funções utilitárias temporárias usadas para popular o Vault
DROP FUNCTION IF EXISTS public.vault_create_cron_secret(text);
DROP FUNCTION IF EXISTS public.vault_update_cron_secret(text);