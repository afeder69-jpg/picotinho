-- Corrigir permissões da tabela whatsapp_telefones_autorizados
-- As políticas RLS já existem e garantem que usuários só vejam seus próprios dados

GRANT SELECT, INSERT, UPDATE, DELETE 
ON public.whatsapp_telefones_autorizados 
TO authenticated;

-- Adicionar comentário explicativo
COMMENT ON TABLE public.whatsapp_telefones_autorizados IS 
'Permissões concedidas para authenticated. Segurança garantida via RLS policies que restringem acesso aos próprios telefones do usuário.';