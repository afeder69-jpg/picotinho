-- ============================================================
-- REMOÇÃO SEGURA DAS TABELAS LEGACY notas_fiscais e compras_app
-- ============================================================
-- 
-- Estas tabelas eram usadas apenas pela função process-danfe-pdf
-- (agora desabilitada) e não são mais necessárias.
-- 
-- O fluxo principal do Picotinho usa apenas notas_imagens -> estoque_app
-- ============================================================

-- 1. Remover tabelas dependentes primeiro (respeitando foreign keys)
DROP TABLE IF EXISTS public.itens_nota CASCADE;
DROP TABLE IF EXISTS public.itens_compra_app CASCADE;

-- 2. Remover tabelas principais
DROP TABLE IF EXISTS public.notas_fiscais CASCADE;
DROP TABLE IF EXISTS public.compras_app CASCADE;

-- 3. Remover triggers relacionados se existirem
DROP TRIGGER IF EXISTS sync_access_key_from_notas_imagens ON public.notas_imagens;
DROP FUNCTION IF EXISTS public.sync_access_key_from_notas_imagens() CASCADE;

-- 4. Remover função de correção de bairros (não mais necessária)
DROP FUNCTION IF EXISTS public.corrigir_bairros_notas() CASCADE;

-- Log da operação
DO $$
BEGIN
  RAISE NOTICE '✅ Tabelas legacy removidas com sucesso:';
  RAISE NOTICE '   - itens_nota';
  RAISE NOTICE '   - notas_fiscais';
  RAISE NOTICE '   - itens_compra_app';
  RAISE NOTICE '   - compras_app';
  RAISE NOTICE '✅ Triggers e funções relacionados removidos';
  RAISE NOTICE '🎯 Sistema agora usa exclusivamente notas_imagens como fonte da verdade';
END $$;