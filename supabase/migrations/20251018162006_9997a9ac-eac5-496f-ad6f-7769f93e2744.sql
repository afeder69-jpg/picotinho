-- =====================================
-- FASE 4: CONFIGURAR CRON JOB DE RECONCILIAÇÃO
-- =====================================

-- Remover job antigo se existir
SELECT cron.unschedule('reconciliar-estoque-master') 
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'reconciliar-estoque-master'
);

-- Agendar reconciliação a cada 6 horas
SELECT cron.schedule(
  'reconciliar-estoque-master',
  '0 */6 * * *', -- A cada 6 horas (00:00, 06:00, 12:00, 18:00)
  $$
  SELECT net.http_post(
    url := 'https://mjsbwrtegorjxcepvrik.supabase.co/functions/v1/reconciliar-estoque-master',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1qc2J3cnRlZ29yanhjZXB2cmlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1NzE5NTYsImV4cCI6MjA3MDE0Nzk1Nn0.Yn3Gdph30PzbiA31OqQgA9QvvCdDZbtXp89G7EoVkxg'
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);

-- Log de sucesso
DO $$
BEGIN
  RAISE NOTICE '✅ Job de reconciliação agendado com sucesso';
  RAISE NOTICE '⏰ Executará a cada 6 horas: 00:00, 06:00, 12:00, 18:00';
  RAISE NOTICE '🔄 Reconciliará automaticamente até 100 produtos sem normalizar por execução';
END $$;