-- =====================================
-- AUTOMAÇÃO: Cron Job para Reconciliação de Estoque
-- =====================================
-- Este job roda automaticamente a cada hora para vincular
-- produtos órfãos (sem sku_global) aos seus respectivos masters

-- Habilitar extensões necessárias (se ainda não estiverem ativas)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Agendar reconciliação automática a cada hora
SELECT cron.schedule(
  'reconciliar-estoque-master-hourly',
  '0 * * * *', -- A cada hora (no minuto 0)
  $$
  SELECT net.http_post(
    url := 'https://mjsbwrtegorjxcepvrik.supabase.co/functions/v1/reconciliar-estoque-master',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1qc2J3cnRlZ29yanhjZXB2cmlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1NzE5NTYsImV4cCI6MjA3MDE0Nzk1Nn0.Yn3Gdph30PzbiA31OqQgA9QvvCdDZbtXp89G7EoVkxg"}'::jsonb,
    body := '{"auto_trigger": true}'::jsonb
  ) AS request_id;
  $$
);