-- 1) Tornar bucket privado
UPDATE storage.buckets SET public = false WHERE id = 'receipts';

-- 2) Remover policies permissivas atuais
DROP POLICY IF EXISTS "Users can view receipt screenshots"   ON storage.objects;
DROP POLICY IF EXISTS "Users can upload receipt screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Users can update receipt screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete receipt screenshots" ON storage.objects;

-- Garantir que não existam variantes já criadas com nomes alvo
DROP POLICY IF EXISTS "Users can view own receipt files"   ON storage.objects;
DROP POLICY IF EXISTS "Users can upload own receipt files" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own receipt files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own receipt files" ON storage.objects;

-- 3) Recriar policies escopadas ao dono (primeira pasta = auth.uid())
CREATE POLICY "Users can view own receipt files"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'receipts'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can upload own receipt files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'receipts'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can update own receipt files"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'receipts'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'receipts'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can delete own receipt files"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'receipts'
  AND (storage.foldername(name))[1] = auth.uid()::text
);