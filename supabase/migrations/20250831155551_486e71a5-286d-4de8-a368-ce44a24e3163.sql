-- Remover a vinculação incorreta do número oficial com usuário específico
DELETE FROM whatsapp_configuracoes WHERE numero_whatsapp = '2197580618';

-- O número oficial do Picotinho não precisa estar na tabela whatsapp_configuracoes
-- A tabela whatsapp_configuracoes é para usuários que querem receber notificações
-- O webhook já está configurado para processar qualquer mensagem que chegue

-- Verificar configurações restantes (apenas usuários que querem notificações)
SELECT 'Configurações de usuários para notificações:' as info, numero_whatsapp, verificado, ativo 
FROM whatsapp_configuracoes 
WHERE ativo = true;