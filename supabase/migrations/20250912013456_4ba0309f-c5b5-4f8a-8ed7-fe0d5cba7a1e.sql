-- Stop any pg_cron jobs that invoke the auto-fix function so it no longer runs automatically
DO $$
DECLARE r RECORD;
BEGIN
  -- Ensure pg_cron is available
  IF to_regclass('cron.job') IS NULL THEN
    RAISE NOTICE 'pg_cron not available; nothing to unschedule';
    RETURN;
  END IF;

  -- Unschedule any jobs whose command references the auto-fix-stuck-notes edge function
  FOR r IN 
    SELECT jobid FROM cron.job 
    WHERE command ILIKE '%functions%/v1/auto-fix-stuck-notes%'
       OR command ILIKE '%auto-fix-stuck-notes%'
  LOOP
    PERFORM cron.unschedule(r.jobid);
  END LOOP;
END $$;