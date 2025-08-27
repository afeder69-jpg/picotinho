-- Corrigir security definer da função
ALTER FUNCTION consolidar_estoque_duplicado() SECURITY INVOKER;
ALTER FUNCTION consolidar_estoque_duplicado() SET search_path TO 'public';