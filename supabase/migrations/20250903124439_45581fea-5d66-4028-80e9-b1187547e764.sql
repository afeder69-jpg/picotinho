-- Corrigir estado atual da configuração WhatsApp para restaurar número verificado

UPDATE whatsapp_configuracoes 
SET numero_whatsapp = '5521970016024', 
    verificado = true, 
    codigo_verificacao = null,
    data_codigo = null,
    webhook_token = '{"numero_pendente": "5521979397111"}',
    updated_at = now()
WHERE usuario_id = 'ae5b5501-7f8a-46da-9cba-b9955a84e697';

-- Adicionar comentário explicativo
COMMENT ON TABLE whatsapp_configuracoes IS 
'Configurações WhatsApp dos usuários. Campo webhook_token usado temporariamente para armazenar número pendente durante processo de verificação.';