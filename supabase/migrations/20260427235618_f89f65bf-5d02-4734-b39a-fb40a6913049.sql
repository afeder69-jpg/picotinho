-- Inserção sintética para validar notificação de falha de processamento via WhatsApp
-- Marcador único em erro_mensagem permite limpeza cirúrgica posterior
INSERT INTO public.notas_imagens (
  usuario_id,
  imagem_url,
  imagem_path,
  status_processamento,
  processada,
  excluida,
  data_criacao,
  erro_mensagem,
  nome_original
) VALUES (
  '7a995ca7-cb46-4f96-bd9c-9007e0ae050f',
  'https://placeholder.local/teste-falha-whatsapp-sintetica.jpg',
  'teste/falha-whatsapp-sintetica.jpg',
  'erro',
  false,
  false,
  now(),
  'TESTE_SINTETICO_FALHA_WHATSAPP_20260427',
  'teste-falha-whatsapp-sintetica.jpg'
);