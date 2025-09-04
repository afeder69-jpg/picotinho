-- Atualizar nas categorias predefinidas
UPDATE categorias_predefinidas 
SET nome = 'Higiene/Farm.' 
WHERE nome = 'Higiene/Farmácia';

-- Atualizar no estoque
UPDATE estoque_app 
SET categoria = 'Higiene/Farm.' 
WHERE categoria = 'Higiene/Farmácia';