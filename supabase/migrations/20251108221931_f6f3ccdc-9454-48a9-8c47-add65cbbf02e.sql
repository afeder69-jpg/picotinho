-- Adicionar coluna apelido na tabela profiles
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS apelido TEXT NOT NULL DEFAULT '';

-- Constraint para máximo de 12 caracteres
ALTER TABLE profiles
ADD CONSTRAINT apelido_max_length CHECK (length(apelido) <= 12);

-- Constraint para apenas caracteres alfanuméricos
ALTER TABLE profiles
ADD CONSTRAINT apelido_alphanumeric CHECK (apelido ~ '^[a-zA-Z0-9]*$');

-- Comentário explicativo
COMMENT ON COLUMN profiles.apelido IS 'Apelido do usuário (obrigatório, máx 12 caracteres alfanuméricos)';