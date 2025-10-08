-- Criar bucket para imagens de receitas
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'receitas-imagens',
  'receitas-imagens',
  true,
  5242880, -- 5MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/jpg']
)
ON CONFLICT (id) DO NOTHING;

-- Função auxiliar para verificar propriedade de arquivo de receita
CREATE OR REPLACE FUNCTION public.is_receita_image_owner(image_path TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verifica se o caminho começa com o user_id do usuário autenticado
  RETURN image_path LIKE auth.uid()::text || '/%';
END;
$$;

-- Comentário da função
COMMENT ON FUNCTION public.is_receita_image_owner(TEXT) IS 
'Verifica se o usuário autenticado é dono da imagem de receita baseado no caminho do arquivo';