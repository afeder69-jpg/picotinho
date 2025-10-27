-- Alterar constraints para cascade delete em produtos_candidatos_normalizacao
ALTER TABLE produtos_candidatos_normalizacao 
DROP CONSTRAINT IF EXISTS produtos_candidatos_normalizacao_nota_imagem_id_fkey;

ALTER TABLE produtos_candidatos_normalizacao 
ADD CONSTRAINT produtos_candidatos_normalizacao_nota_imagem_id_fkey 
FOREIGN KEY (nota_imagem_id) 
REFERENCES notas_imagens(id) 
ON DELETE CASCADE;

-- Alterar constraints para cascade delete em normalizacao_falhas
ALTER TABLE normalizacao_falhas 
DROP CONSTRAINT IF EXISTS normalizacao_falhas_nota_imagem_id_fkey;

ALTER TABLE normalizacao_falhas 
ADD CONSTRAINT normalizacao_falhas_nota_imagem_id_fkey 
FOREIGN KEY (nota_imagem_id) 
REFERENCES notas_imagens(id) 
ON DELETE CASCADE;