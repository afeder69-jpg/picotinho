-- Atualizar número do WhatsApp do Picotinho
UPDATE whatsapp_configuracoes 
SET numero_whatsapp = '5521992729486', 
    updated_at = now() 
WHERE ativo = true;