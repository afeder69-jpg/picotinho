-- Aplicar normalização manual nas notas existentes que não foram normalizadas
UPDATE notas_imagens 
SET dados_extraidos = jsonb_set(
    dados_extraidos,
    '{estabelecimento,nome}',
    '"COSTAZUL"'
)
WHERE dados_extraidos->'estabelecimento'->>'nome' = 'COSTAZUL ALIMENTOS LTDA';