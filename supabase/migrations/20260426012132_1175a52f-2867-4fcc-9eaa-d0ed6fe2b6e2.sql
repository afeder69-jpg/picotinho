-- Remove duplicatas do job 318ad279, mantendo o mais recente por preco_atual_id
DELETE FROM public.precos_atuais_auditoria a
USING public.precos_atuais_auditoria b
WHERE a.job_id = '318ad279-b700-4175-887e-370a230d90cb'
  AND b.job_id = '318ad279-b700-4175-887e-370a230d90cb'
  AND a.preco_atual_id = b.preco_atual_id
  AND a.created_at < b.created_at;