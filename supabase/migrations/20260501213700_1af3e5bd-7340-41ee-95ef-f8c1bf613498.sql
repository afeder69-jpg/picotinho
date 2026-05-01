CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove agendamento anterior se existir (idempotente)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'retry-consulta-nfce-pendente-5min') THEN
    PERFORM cron.unschedule('retry-consulta-nfce-pendente-5min');
  END IF;
END $$;

SELECT cron.schedule(
  'retry-consulta-nfce-pendente-5min',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://mjsbwrtegorjxcepvrik.supabase.co/functions/v1/retry-consulta-nfce-pendente',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1qc2J3cnRlZ29yanhjZXB2cmlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1NzE5NTYsImV4cCI6MjA3MDE0Nzk1Nn0.Yn3Gdph30PzbiA31OqQgA9QvvCdDZbtXp89G7EoVkxg"}'::jsonb,
    body := jsonb_build_object('trigger', 'cron', 'time', now())
  );
  $$
);