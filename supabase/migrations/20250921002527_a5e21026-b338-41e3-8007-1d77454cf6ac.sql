-- Marcar nota atual como não processada para permitir reprocessamento
UPDATE notas_imagens 
SET processada = false, updated_at = now()
WHERE id = '43d91fa0-2382-4b9c-826b-615bd7ceff15';