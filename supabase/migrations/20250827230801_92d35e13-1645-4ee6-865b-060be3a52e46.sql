-- Remover registros de páginas convertidas que não deveriam estar na tabela principal
DELETE FROM notas_imagens 
WHERE dados_extraidos->>'pdf_origem_id' IS NOT NULL;