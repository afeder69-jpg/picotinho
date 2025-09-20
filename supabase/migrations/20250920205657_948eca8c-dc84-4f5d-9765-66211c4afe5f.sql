-- Resetar a nota para reprocessamento
UPDATE notas_imagens 
SET processada = false, updated_at = now()
WHERE id = '12b186ce-a6fb-408e-be95-f793ec38d9ba' 
AND usuario_id = 'ae5b5501-7f8a-46da-9cba-b9955a84e697';