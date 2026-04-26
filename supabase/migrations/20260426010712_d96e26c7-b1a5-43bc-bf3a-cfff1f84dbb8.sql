
-- Tabela de jobs de auditoria
CREATE TABLE IF NOT EXISTS public.precos_atuais_auditoria_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'running',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  total_analisados INTEGER NOT NULL DEFAULT 0,
  total_legitimos INTEGER NOT NULL DEFAULT 0,
  total_suspeitos INTEGER NOT NULL DEFAULT 0,
  total_nota_nao_encontrada INTEGER NOT NULL DEFAULT 0,
  total_nota_sem_item INTEGER NOT NULL DEFAULT 0,
  total_master_invalido INTEGER NOT NULL DEFAULT 0,
  total_replicacao_cruzada INTEGER NOT NULL DEFAULT 0,
  parametros JSONB,
  resumo JSONB,
  erro TEXT,
  criado_por UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.precos_atuais_auditoria_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Masters podem ver jobs de auditoria"
ON public.precos_atuais_auditoria_jobs
FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'master'::app_role));

-- Tabela de registros auditados
CREATE TABLE IF NOT EXISTS public.precos_atuais_auditoria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.precos_atuais_auditoria_jobs(id) ON DELETE CASCADE,
  preco_atual_id UUID NOT NULL,
  produto_master_id UUID,
  produto_nome TEXT,
  estabelecimento_cnpj TEXT,
  estabelecimento_nome TEXT,
  valor_unitario NUMERIC,
  data_atualizacao TIMESTAMPTZ,
  user_id UUID,
  classificacao TEXT NOT NULL, -- 'legitimo' | 'suspeito'
  motivo TEXT,                 -- 'master_invalido' | 'nota_nao_encontrada' | 'nota_sem_item' | 'ok_ean' | 'ok_desc_qtd_valor'
  nota_imagem_id UUID,
  item_match JSONB,            -- detalhes do item correspondente quando legítimo
  replicacao_count INTEGER DEFAULT 0, -- quantos master_ids distintos compartilham (cnpj, valor) na mesma data
  evidencia JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auditoria_job ON public.precos_atuais_auditoria(job_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_classificacao ON public.precos_atuais_auditoria(classificacao);
CREATE INDEX IF NOT EXISTS idx_auditoria_motivo ON public.precos_atuais_auditoria(motivo);
CREATE INDEX IF NOT EXISTS idx_auditoria_preco_id ON public.precos_atuais_auditoria(preco_atual_id);

ALTER TABLE public.precos_atuais_auditoria ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Masters podem ver auditoria"
ON public.precos_atuais_auditoria
FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'master'::app_role));
