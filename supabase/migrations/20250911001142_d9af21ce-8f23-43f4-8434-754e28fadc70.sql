-- Habilitar extensões necessárias para cron jobs
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Criar cron job para correção automática de preços a cada 30 minutos
SELECT cron.schedule(
  'auto-fix-precos-zerados',
  '*/30 * * * *', -- A cada 30 minutos
  $$
  SELECT
    net.http_post(
        url:='https://mjsbwrtegorjxcepvrik.supabase.co/functions/v1/fix-precos-automatico-cron',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1qc2J3cnRlZ29yanhjZXB2cmlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1NzE5NTYsImV4cCI6MjA3MDE0Nzk1Nn0.Yn3Gdph30PzbiA31OqQgA9QvvCdDZbtXp89G7EoVkxg"}'::jsonb,
        body:=concat('{"timestamp": "', now(), '"}')::jsonb
    ) as request_id;
  $$
);