-- Deletar todas as receitas de exemplo, mantendo apenas receitas criadas recentemente pelos usuários
-- Vamos manter apenas receitas criadas após 2025-10-11 (hoje)
DELETE FROM receitas 
WHERE created_at < '2025-10-11 00:00:00+00';