-- Atualizar nas categorias predefinidas
UPDATE categorias_predefinidas 
SET nome = 'Higie./Farm.' 
WHERE nome = 'Higiene/Farm.';

-- Atualizar no estoque
UPDATE estoque_app 
SET categoria = 'Higie./Farm.' 
WHERE categoria = 'Higiene/Farm.';