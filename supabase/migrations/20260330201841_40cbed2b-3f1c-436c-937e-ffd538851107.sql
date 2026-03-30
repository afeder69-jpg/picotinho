ALTER TABLE public.precos_atuais
  DROP CONSTRAINT IF EXISTS precos_atuais_produto_master_id_fkey,
  ADD CONSTRAINT precos_atuais_produto_master_id_fkey
    FOREIGN KEY (produto_master_id)
    REFERENCES public.produtos_master_global(id)
    ON DELETE SET NULL;

ALTER TABLE public.produtos_candidatos_normalizacao
  DROP CONSTRAINT IF EXISTS produtos_candidatos_normalizacao_sugestao_produto_master_fkey,
  ADD CONSTRAINT produtos_candidatos_normalizacao_sugestao_produto_master_fkey
    FOREIGN KEY (sugestao_produto_master)
    REFERENCES public.produtos_master_global(id)
    ON DELETE SET NULL;