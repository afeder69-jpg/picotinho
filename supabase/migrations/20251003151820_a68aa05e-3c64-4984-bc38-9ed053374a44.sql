-- PARTE 1: Adicionar campos de imagem em produtos_master_global
ALTER TABLE produtos_master_global 
ADD COLUMN IF NOT EXISTS imagem_url TEXT,
ADD COLUMN IF NOT EXISTS imagem_path TEXT,
ADD COLUMN IF NOT EXISTS imagem_adicionada_por UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS imagem_adicionada_em TIMESTAMPTZ;

COMMENT ON COLUMN produtos_master_global.imagem_url IS 'URL pública da imagem do produto';
COMMENT ON COLUMN produtos_master_global.imagem_path IS 'Path completo no storage bucket';

-- PARTE 2: Criar bucket de Storage
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'produtos-master-fotos',
  'produtos-master-fotos',
  true,
  5242880, -- 5MB
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
) ON CONFLICT (id) DO NOTHING;

-- PARTE 3: RLS Policies para o bucket
CREATE POLICY "Masters podem fazer upload de fotos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'produtos-master-fotos' 
  AND has_role(auth.uid(), 'master'::app_role)
);

CREATE POLICY "Masters podem atualizar fotos"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'produtos-master-fotos' AND has_role(auth.uid(), 'master'::app_role))
WITH CHECK (bucket_id = 'produtos-master-fotos' AND has_role(auth.uid(), 'master'::app_role));

CREATE POLICY "Masters podem deletar fotos"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'produtos-master-fotos' AND has_role(auth.uid(), 'master'::app_role));

CREATE POLICY "Todos podem ver fotos dos produtos"
ON storage.objects FOR SELECT
USING (bucket_id = 'produtos-master-fotos');