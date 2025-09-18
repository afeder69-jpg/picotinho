-- Primeiro, remover a constraint restritiva atual
ALTER TABLE estoque_app DROP CONSTRAINT IF EXISTS check_categoria_valida;

-- Criar uma nova constraint mais flexível que aceita as categorias que a IA extrai
ALTER TABLE estoque_app ADD CONSTRAINT check_categoria_valida 
CHECK (categoria::text = ANY (ARRAY[
    'Hortifruti'::text, 'hortifruti'::text,
    'Bebidas'::text, 'bebidas'::text,
    'Mercearia'::text, 'mercearia'::text,
    'Açougue'::text, 'açougue'::text, 'Carnes'::text, 'carnes'::text,
    'Padaria'::text, 'padaria'::text,
    'Laticínios/Frios'::text, 'laticínios/frios'::text, 'Laticínios'::text, 'laticínios'::text,
    'Limpeza'::text, 'limpeza'::text,
    'Higiene/Farmácia'::text, 'higiene/farmácia'::text,
    'Congelados'::text, 'congelados'::text,
    'Pet'::text, 'pet'::text,
    'Outros'::text, 'outros'::text
]));

-- Comentário: Agora aceita tanto maiúsculas quanto minúsculas e as categorias que a IA extrai