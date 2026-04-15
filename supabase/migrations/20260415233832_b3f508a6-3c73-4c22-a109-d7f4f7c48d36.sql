UPDATE notas_imagens
SET excluida = true, updated_at = now()
WHERE id IN (
  'e266e362-a180-4e79-b5f1-829925111713',
  '2843b11f-c105-4d4d-a70d-b67b1fe473c2',
  '39798faa-a8ab-4347-8f05-b87b322ee9b2'
)
AND processada = false
AND (excluida IS NOT TRUE);