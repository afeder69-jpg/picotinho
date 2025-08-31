-- Limpar dados do número problemático 21970016024
DELETE FROM whatsapp_mensagens WHERE remetente LIKE '%21970016024%' OR remetente LIKE '%970016024%';

DELETE FROM whatsapp_configuracoes WHERE numero_whatsapp LIKE '%21970016024%' OR numero_whatsapp LIKE '%970016024%';

-- Verificar se restaram configurações válidas
SELECT 'Configurações restantes:' as info, COUNT(*) as total FROM whatsapp_configuracoes;

-- Mostrar usuários ativos no WhatsApp após limpeza
SELECT 
    numero_whatsapp,
    verificado,
    ativo,
    created_at,
    usuario_id
FROM whatsapp_configuracoes 
WHERE ativo = true
ORDER BY created_at DESC;