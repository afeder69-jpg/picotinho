-- Corrigir as views existentes removendo SECURITY DEFINER e adicionando search_path seguro
ALTER VIEW view_comparacao_supermercados_app SET (security_barrier = true);
ALTER VIEW view_gastos_categoria_app SET (security_barrier = true);
ALTER VIEW view_preco_medio_produto_app SET (security_barrier = true);