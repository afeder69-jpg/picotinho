-- Remove constraint que impede múltiplas receitas por refeição
ALTER TABLE cardapio_receitas 
DROP CONSTRAINT IF EXISTS cardapio_receitas_cardapio_id_dia_semana_refeicao_key;

-- Comentário explicativo
COMMENT ON TABLE cardapio_receitas IS 'Permite múltiplas receitas por refeição, incluindo receitas duplicadas (com confirmação do usuário)';