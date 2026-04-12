-- Backfill: normalizar categorias vazias/nulas em consumos_app
UPDATE consumos_app
SET categoria = 'outros'
WHERE categoria IS NULL OR trim(categoria) = '';