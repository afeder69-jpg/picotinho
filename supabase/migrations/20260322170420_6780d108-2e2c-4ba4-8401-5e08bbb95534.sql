
-- Add produto_master_id column to precos_atuais
ALTER TABLE public.precos_atuais
  ADD COLUMN IF NOT EXISTS produto_master_id uuid REFERENCES public.produtos_master_global(id);

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_precos_atuais_produto_master_id
  ON public.precos_atuais(produto_master_id);

-- Conservative backfill: link precos_atuais to master via produtos_candidatos_normalizacao
-- Only where there's a clear 1:1 match (texto_original matches produto_nome exactly)
UPDATE public.precos_atuais pa
SET produto_master_id = pcn.sugestao_produto_master
FROM public.produtos_candidatos_normalizacao pcn
WHERE pcn.sugestao_produto_master IS NOT NULL
  AND pcn.status IN ('auto_aprovado', 'aprovado')
  AND UPPER(TRIM(pcn.texto_original)) = UPPER(TRIM(pa.produto_nome))
  AND pa.produto_master_id IS NULL;

-- Secondary backfill: link via estoque_app where produto_master_id is already set
UPDATE public.precos_atuais pa
SET produto_master_id = ea.produto_master_id
FROM public.estoque_app ea
WHERE ea.produto_master_id IS NOT NULL
  AND UPPER(TRIM(ea.produto_nome)) = UPPER(TRIM(pa.produto_nome))
  AND pa.produto_master_id IS NULL;
