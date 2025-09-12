-- Atualizar CRON para executar a cada 2 minutos (muito mais rápido)
SELECT cron.unschedule('auto-fix-stuck-notes');

SELECT cron.schedule(
  'auto-fix-stuck-notes',
  '*/2 * * * *', -- A cada 2 minutos
  'SELECT functions.http_post(''https://mjsbwrtegorjxcepvrik.supabase.co/functions/v1/auto-fix-stuck-notes'', '''', ''application/json'');'
);