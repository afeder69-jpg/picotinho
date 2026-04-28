DELETE FROM public.notificacoes_log
 WHERE nota_id IN (
   SELECT id FROM public.notas_imagens
   WHERE erro_mensagem = 'TESTE_SINTETICO_FALHA_WHATSAPP_20260427'
 );

DELETE FROM public.notas_imagens
 WHERE erro_mensagem = 'TESTE_SINTETICO_FALHA_WHATSAPP_20260427';