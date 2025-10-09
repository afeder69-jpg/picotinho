-- Corrigir função RPC para tipos corretos
DROP FUNCTION IF EXISTS public.buscar_receitas_disponiveis();

CREATE OR REPLACE FUNCTION public.buscar_receitas_disponiveis()
RETURNS TABLE (
  receita_id uuid,
  titulo text,
  descricao text,
  categoria text,
  tempo_preparo text,
  porcoes text,
  imagem_url text,
  total_ingredientes integer,
  ingredientes_disponiveis integer,
  disponibilidade text
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    r.id as receita_id,
    r.titulo,
    r.modo_preparo as descricao,
    r.categoria,
    r.tempo_preparo,
    COALESCE(r.porcoes::text, '') as porcoes,
    r.imagem_url,
    COUNT(ri.id)::integer as total_ingredientes,
    COUNT(CASE 
      WHEN e.id IS NOT NULL THEN 1 
      ELSE NULL 
    END)::integer as ingredientes_disponiveis,
    CASE 
      WHEN COUNT(ri.id) = 0 THEN 'completo'
      WHEN COUNT(CASE WHEN e.id IS NOT NULL THEN 1 ELSE NULL END) = COUNT(ri.id) THEN 'completo'
      WHEN COUNT(CASE WHEN e.id IS NOT NULL THEN 1 ELSE NULL END) > 0 THEN 'parcial'
      ELSE 'indisponivel'
    END as disponibilidade
  FROM receitas r
  LEFT JOIN receita_ingredientes ri ON ri.receita_id = r.id
  LEFT JOIN estoque_app e ON (
    e.user_id = auth.uid() AND
    (
      UPPER(TRIM(e.produto_nome)) = UPPER(TRIM(ri.produto_nome_busca)) OR
      UPPER(TRIM(e.produto_nome)) LIKE '%' || UPPER(TRIM(ri.produto_nome_busca)) || '%' OR
      UPPER(TRIM(ri.produto_nome_busca)) LIKE '%' || UPPER(TRIM(e.produto_nome)) || '%'
    )
  )
  WHERE r.user_id = auth.uid()
  GROUP BY r.id, r.titulo, r.modo_preparo, r.categoria, r.tempo_preparo, r.porcoes, r.imagem_url
  ORDER BY r.created_at DESC;
END;
$$;