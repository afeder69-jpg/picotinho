-- Limpar todas as configurações antigas para evitar conflitos
DELETE FROM whatsapp_mensagens WHERE usuario_id IS NULL OR remetente NOT LIKE '%2197580%';

-- Limpar configurações antigas exceto a que será usada
DELETE FROM whatsapp_configuracoes WHERE numero_whatsapp NOT LIKE '%2197580%';

-- Garantir que temos uma configuração limpa para o novo número
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
) ON CONFLICT (numero_whatsapp) DO UPDATE SET
    verificado = true,
    ativo = true,
    updated_at = now();

-- Verificar configurações restantes
SELECT 'Configurações WhatsApp ativas:' as info, numero_whatsapp, verificado, ativo 
FROM whatsapp_configuracoes 
WHERE ativo = true;