-- Adicionar coluna sinonimos na tabela categorias
ALTER TABLE public.categorias ADD COLUMN sinonimos text[];

-- Popular a tabela com os sinônimos fornecidos
UPDATE public.categorias SET sinonimos = ARRAY[
  'açougue', 'acougue', 'asogue', 'asog', 'açogue', 'açog', 'carnes', 'frango', 'frangos', 
  'peixe', 'peixes', 'suínos', 'suino', 'bovino', 'carne'
] WHERE UPPER(nome) = 'AÇOUGUE';

UPDATE public.categorias SET sinonimos = ARRAY[
  'hortifruti', 'hortfruti', 'hortifrute', 'horte fruti', 'horte frute', 'frutas', 
  'verduras', 'legumes', 'hortaliças'
] WHERE UPPER(nome) = 'HORTIFRUTI';

UPDATE public.categorias SET sinonimos = ARRAY[
  'laticinios', 'laticínios', 'frios', 'queijo', 'queijos', 'leite', 'iogurte', 
  'manteiga', 'requeijão', 'embutidos'
] WHERE UPPER(nome) LIKE 'LATICÍNIOS%' OR UPPER(nome) LIKE 'LATICINIOS%';

UPDATE public.categorias SET sinonimos = ARRAY[
  'higiene', 'farmácia', 'farmacia', 'remedios', 'remédios', 'cuidados pessoais', 
  'sabonete', 'shampoo', 'creme dental'
] WHERE UPPER(nome) LIKE 'HIGIENE%';

UPDATE public.categorias SET sinonimos = ARRAY[
  'bebidas', 'bebida', 'suco', 'sucos', 'refrigerante', 'refrigerantes', 'cerveja', 
  'cervejas', 'vinho', 'vinhos', 'água', 'agua'
] WHERE UPPER(nome) = 'BEBIDAS';

UPDATE public.categorias SET sinonimos = ARRAY[
  'mercearia', 'arroz', 'feijao', 'feijão', 'macarrão', 'massa', 'massas', 'oleo', 
  'óleo', 'sal', 'açúcar', 'café', 'farinha', 'enlatado', 'enlatados'
] WHERE UPPER(nome) = 'MERCEARIA';

UPDATE public.categorias SET sinonimos = ARRAY[
  'padaria', 'pão', 'pao', 'pães', 'bolos', 'biscoito', 'biscoitos', 'salgados', 'torta'
] WHERE UPPER(nome) = 'PADARIA';

UPDATE public.categorias SET sinonimos = ARRAY[
  'congelados', 'congelado', 'sorvete', 'pizza congelada', 'nuggets', 'hambúrguer', 
  'hambúrgueres', 'peixe congelado'
] WHERE UPPER(nome) = 'CONGELADOS';

UPDATE public.categorias SET sinonimos = ARRAY[
  'limpeza', 'limpar', 'detergente', 'sabão', 'sabao', 'desinfetante', 'amaciante', 
  'água sanitária', 'cloro'
] WHERE UPPER(nome) = 'LIMPEZA';

UPDATE public.categorias SET sinonimos = ARRAY[
  'pet', 'animais', 'ração', 'racao', 'cachorro', 'cães', 'gatos', 'gato', 'coleira', 'petiscos'
] WHERE UPPER(nome) = 'PET';

UPDATE public.categorias SET sinonimos = ARRAY[
  'outros', 'outro', 'diversos', 'variados', 'miscelânea'
] WHERE UPPER(nome) = 'OUTROS';

-- Criar função para buscar categoria por nome ou sinônimo
CREATE OR REPLACE FUNCTION public.buscar_categoria_por_termo(termo_busca text)
RETURNS TABLE(
  id uuid,
  nome text,
  descricao text,
  cor character varying,
  icone character varying,
  ativa boolean,
  sinonimos text[]
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT c.id, c.nome, c.descricao, c.cor, c.icone, c.ativa, c.sinonimos
  FROM public.categorias c
  WHERE c.ativa = true
  AND (
    -- Busca pelo nome oficial (case-insensitive)
    UPPER(c.nome) = UPPER(TRIM(termo_busca))
    OR
    -- Busca nos sinônimos (case-insensitive)
    EXISTS (
      SELECT 1 FROM unnest(c.sinonimos) AS sinonimo
      WHERE UPPER(sinonimo) = UPPER(TRIM(termo_busca))
    )
    OR
    -- Busca parcial no nome
    UPPER(c.nome) LIKE '%' || UPPER(TRIM(termo_busca)) || '%'
    OR
    -- Busca parcial nos sinônimos
    EXISTS (
      SELECT 1 FROM unnest(c.sinonimos) AS sinonimo
      WHERE UPPER(sinonimo) LIKE '%' || UPPER(TRIM(termo_busca)) || '%'
    )
  )
  ORDER BY 
    -- Priorizar correspondência exata no nome
    CASE WHEN UPPER(c.nome) = UPPER(TRIM(termo_busca)) THEN 1 ELSE 2 END,
    -- Depois correspondência exata nos sinônimos
    CASE WHEN EXISTS (
      SELECT 1 FROM unnest(c.sinonimos) AS sinonimo
      WHERE UPPER(sinonimo) = UPPER(TRIM(termo_busca))
    ) THEN 1 ELSE 2 END,
    c.nome;
END;
$$;