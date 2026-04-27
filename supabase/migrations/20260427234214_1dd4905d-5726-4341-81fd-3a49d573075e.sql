-- Atualiza apenas o schedule do job existente (jobid 7) de */5 para */1 minuto
SELECT cron.alter_job(
  job_id   := 7,
  schedule := '*/1 * * * *'
);