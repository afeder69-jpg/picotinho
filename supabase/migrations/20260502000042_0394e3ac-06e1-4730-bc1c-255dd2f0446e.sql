UPDATE public.notas_imagens
SET 
  proxima_tentativa_em = now(),
  motivo_pendencia = 'reagendada_apos_correcao_roteamento_ce',
  updated_at = now()
WHERE id IN (
  'b36b51dd-a5fe-4f52-ab40-859cab8d9beb',
  '6393499c-b7ca-43b4-ac2c-26e9a67f6067'
)
AND status_processamento = 'pendente_consulta';