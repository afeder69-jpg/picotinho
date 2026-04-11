-- Fill existing NULLs/empties in master
UPDATE produtos_master_global
SET categoria = 'OUTROS', updated_at = now()
WHERE categoria IS NULL OR trim(categoria) = '';

-- Fill existing NULLs/empties in estoque
UPDATE estoque_app
SET categoria = 'outros', updated_at = now()
WHERE categoria IS NULL OR trim(categoria) = '';

-- Set default for master (already NOT NULL via existing schema, just add default)
ALTER TABLE produtos_master_global
  ALTER COLUMN categoria SET DEFAULT 'OUTROS';

-- Set default for estoque
ALTER TABLE estoque_app
  ALTER COLUMN categoria SET DEFAULT 'outros';