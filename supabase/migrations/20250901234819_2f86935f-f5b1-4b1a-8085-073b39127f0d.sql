-- Atualizar números WhatsApp que não têm código do país
UPDATE whatsapp_configuracoes 
SET numero_whatsapp = '55' || numero_whatsapp, 
    updated_at = now()
WHERE numero_whatsapp NOT LIKE '55%' 
  AND LENGTH(numero_whatsapp) = 11 
  AND numero_whatsapp LIKE '21%';