-- Testar a normalização de produtos similares
SELECT 'ABACATE GRANEL' as produto_original, upper(trim('ABACATE GRANEL')) as normalizado_simples;
SELECT 'ABACATE KG GRANEL' as produto_original, upper(trim('ABACATE KG GRANEL')) as normalizado_simples;