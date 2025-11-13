-- Habilitar Realtime para a tabela notas_imagens
-- Isso permite que o frontend receba notificações quando uma nota for processada

-- Configurar REPLICA IDENTITY FULL para capturar todos os dados nas mudanças
ALTER TABLE public.notas_imagens REPLICA IDENTITY FULL;

-- Adicionar a tabela à publicação do Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notas_imagens;