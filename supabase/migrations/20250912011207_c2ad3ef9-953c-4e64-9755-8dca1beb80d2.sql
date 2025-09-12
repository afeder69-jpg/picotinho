-- Criar função CRON para auto-corrigir notas travadas
-- Executar a cada 15 minutos para detectar e corrigir notas travadas automaticamente

SELECT cron.schedule(
  'auto-fix-stuck-notes',
  '*/15 * * * *', -- A cada 15 minutos
  'SELECT functions.http_post(''https://mjsbwrtegorjxcepvrik.supabase.co/functions/v1/auto-fix-stuck-notes'', '''', ''application/json'');'
);