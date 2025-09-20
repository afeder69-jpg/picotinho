-- Resetar a nova nota para reprocessamento
UPDATE notas_imagens 
SET processada = false, updated_at = now()
WHERE id = 'bfb8097d-dc10-4739-8182-b00f95730148' 
AND usuario_id = 'ae5b5501-7f8a-46da-9cba-b9955a84e697';