-- Criar tipo enum para tipo de refeição
CREATE TYPE tipo_refeicao AS ENUM ('cafe_manha', 'almoco', 'jantar', 'lanche', 'sobremesa');

-- Adicionar coluna tipo_refeicao na tabela receitas
ALTER TABLE receitas ADD COLUMN tipo_refeicao tipo_refeicao;

-- Migrar dados existentes de categoria para tipo_refeicao
UPDATE receitas 
SET tipo_refeicao = categoria::tipo_refeicao
WHERE categoria IN ('cafe_manha', 'almoco', 'jantar', 'lanche', 'sobremesa');

-- Limpar o campo categoria para receber as categorias reais de comida
UPDATE receitas SET categoria = NULL;

-- Adicionar comentário para documentar
COMMENT ON COLUMN receitas.tipo_refeicao IS 'Tipo de refeição: café da manhã, almoço, jantar, lanche ou sobremesa';
COMMENT ON COLUMN receitas.categoria IS 'Categoria de comida: Carne Bovina, Frango, Sobremesa, etc.';