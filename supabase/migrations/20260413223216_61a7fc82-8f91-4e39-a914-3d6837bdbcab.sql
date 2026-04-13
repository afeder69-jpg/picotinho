ALTER TABLE listas_compras REPLICA IDENTITY FULL;
ALTER TABLE listas_compras_itens REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE listas_compras;
ALTER PUBLICATION supabase_realtime ADD TABLE listas_compras_itens;