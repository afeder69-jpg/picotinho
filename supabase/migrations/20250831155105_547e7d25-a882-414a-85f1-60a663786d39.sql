-- Primeiro, limpar dados antigos problemáticos
DELETE FROM whatsapp_mensagens WHERE usuario_id IS NULL OR remetente NOT LIKE '%2197580%';
DELETE FROM whatsapp_configuracoes WHERE numero_whatsapp NOT LIKE '%2197580%';

-- Inserir a configuração para o novo número sem conflito
INSERT INTO whatsapp_configuracoes (
    usuario_id, 
    numero_whatsapp, 
    verificado, 
    ativo,
    api_provider
) VALUES (
    'ae5b5501-7f8a-46da-9cba-b9955a84e697'::uuid,
    '2197580618',
    true,
    true,
    'z-api'
);

-- Verificar configurações ativas
SELECT 'Configurações WhatsApp após limpeza:' as info, numero_whatsapp, verificado, ativo, created_at 
FROM whatsapp_configuracoes 
WHERE ativo = true
ORDER BY created_at DESC;