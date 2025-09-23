-- Adicionar coluna sinonimos na tabela categorias
ALTER TABLE public.categorias 
ADD COLUMN IF NOT EXISTS sinonimos text[];

-- Adicionar constraint única na coluna nome se não existir
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'categorias_nome_key' AND conrelid = 'public.categorias'::regclass
    ) THEN
        ALTER TABLE public.categorias ADD CONSTRAINT categorias_nome_key UNIQUE (nome);
    END IF;
END $$;

-- Dropar função existente e recriar
DROP FUNCTION IF EXISTS public.buscar_categoria_por_termo(text);

-- Popular a tabela categorias com os dados fornecidos e seus sinônimos
INSERT INTO public.categorias (nome, sinonimos, ativa, descricao) VALUES
('AÇOUGUE', ARRAY['açougue', 'acougue', 'asogue', 'asog', 'açogue', 'açog', 'carnes', 'frango', 'frangos', 'peixe', 'peixes', 'suínos', 'suino', 'bovino', 'carne'], true, 'Carnes, frangos, peixes e derivados'),
('HORTIFRUTI', ARRAY['hortifruti', 'hortfruti', 'hortifrute', 'horte fruti', 'horte frute', 'frutas', 'verduras', 'legumes', 'hortaliças'], true, 'Frutas, verduras e legumes'),
('LATICÍNIOS/FRIOS', ARRAY['laticinios', 'laticínios', 'frios', 'queijo', 'queijos', 'leite', 'iogurte', 'manteiga', 'requeijão', 'embutidos'], true, 'Laticínios e produtos refrigerados'),
('HIGIENE/FARMÁCIA', ARRAY['higiene', 'farmácia', 'farmacia', 'remedios', 'remédios', 'cuidados pessoais', 'sabonete', 'shampoo', 'creme dental'], true, 'Produtos de higiene e farmácia'),
('BEBIDAS', ARRAY['bebidas', 'bebida', 'suco', 'sucos', 'refrigerante', 'refrigerantes', 'cerveja', 'cervejas', 'vinho', 'vinhos', 'água', 'agua'], true, 'Bebidas em geral'),
('MERCEARIA', ARRAY['mercearia', 'arroz', 'feijao', 'feijão', 'macarrão', 'massa', 'massas', 'oleo', 'óleo', 'sal', 'açúcar', 'café', 'farinha', 'enlatado', 'enlatados'], true, 'Produtos básicos de mercearia'),
('PADARIA', ARRAY['padaria', 'pão', 'pao', 'pães', 'bolos', 'biscoito', 'biscoitos', 'salgados', 'torta'], true, 'Produtos de padaria'),
('CONGELADOS', ARRAY['congelados', 'congelado', 'sorvete', 'pizza congelada', 'nuggets', 'hambúrguer', 'hambúrgueres', 'peixe congelado'], true, 'Produtos congelados'),
('LIMPEZA', ARRAY['limpeza', 'limpar', 'detergente', 'sabão', 'sabao', 'desinfetante', 'amaciante', 'água sanitária', 'cloro'], true, 'Produtos de limpeza'),
('PET', ARRAY['pet', 'animais', 'ração', 'racao', 'cachorro', 'cães', 'gatos', 'gato', 'coleira', 'petiscos'], true, 'Produtos para animais'),
('OUTROS', ARRAY['outros', 'outro', 'diversos', 'variados', 'miscelânea'], true, 'Produtos diversos')
ON CONFLICT (nome) DO UPDATE SET
  sinonimos = EXCLUDED.sinonimos,
  descricao = EXCLUDED.descricao;

-- Criar função para buscar categoria por termo considerando sinônimos
CREATE OR REPLACE FUNCTION public.buscar_categoria_por_termo(termo_busca text)
RETURNS TABLE(
  categoria_nome text
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  termo_normalizado text;
BEGIN
  -- Normalizar o termo de busca (maiúsculo, sem acentos especiais)
  termo_normalizado := UPPER(TRIM(termo_busca));
  
  -- Buscar categoria que corresponda ao nome oficial ou aos sinônimos
  RETURN QUERY
  SELECT c.nome
  FROM public.categorias c
  WHERE c.ativa = true
  AND (
    -- Busca exata no nome oficial
    UPPER(c.nome) = termo_normalizado
    OR
    -- Busca nos sinônimos (case insensitive)
    EXISTS (
      SELECT 1 
      FROM unnest(c.sinonimos) AS sinonimo
      WHERE UPPER(sinonimo) = termo_normalizado
    )
    OR
    -- Busca parcial no nome oficial
    UPPER(c.nome) LIKE '%' || termo_normalizado || '%'
    OR
    -- Busca parcial nos sinônimos
    EXISTS (
      SELECT 1 
      FROM unnest(c.sinonimos) AS sinonimo
      WHERE UPPER(sinonimo) LIKE '%' || termo_normalizado || '%'
    )
  )
  ORDER BY 
    -- Priorizar match exato no nome oficial
    CASE WHEN UPPER(c.nome) = termo_normalizado THEN 1 ELSE 2 END,
    -- Depois match exato nos sinônimos
    CASE WHEN EXISTS (
      SELECT 1 FROM unnest(c.sinonimos) AS s 
      WHERE UPPER(s) = termo_normalizado
    ) THEN 1 ELSE 2 END,
    c.nome
  LIMIT 1;
END;
$function$;