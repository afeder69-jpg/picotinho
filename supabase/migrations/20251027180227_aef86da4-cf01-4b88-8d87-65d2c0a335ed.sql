-- Criar tabela de cache para InfoSimples (NFC-e)
CREATE TABLE IF NOT EXISTS public.nfce_cache_infosimples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chave_nfce TEXT UNIQUE NOT NULL,
  cnpj_emitente TEXT,
  nome_emitente TEXT,
  data_emissao TIMESTAMP WITH TIME ZONE,
  valor_total NUMERIC(10,2),
  dados_completos JSONB NOT NULL,
  total_consultas INTEGER NOT NULL DEFAULT 1,
  primeira_consulta TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  ultima_consulta TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_nfce_cache_chave ON public.nfce_cache_infosimples(chave_nfce);
CREATE INDEX IF NOT EXISTS idx_nfce_cache_cnpj ON public.nfce_cache_infosimples(cnpj_emitente);
CREATE INDEX IF NOT EXISTS idx_nfce_cache_data ON public.nfce_cache_infosimples(data_emissao);

-- RLS Policies para service role apenas
ALTER TABLE public.nfce_cache_infosimples ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role pode ler cache NFC-e InfoSimples"
  ON public.nfce_cache_infosimples
  FOR SELECT
  USING (
    current_setting('role', true) = 'service_role' 
    OR (auth.jwt() ->> 'role') = 'service_role' 
    OR auth.uid() IS NULL
  );

CREATE POLICY "Service role pode inserir cache NFC-e InfoSimples"
  ON public.nfce_cache_infosimples
  FOR INSERT
  WITH CHECK (
    current_setting('role', true) = 'service_role' 
    OR (auth.jwt() ->> 'role') = 'service_role' 
    OR auth.uid() IS NULL
  );

CREATE POLICY "Service role pode atualizar cache NFC-e InfoSimples"
  ON public.nfce_cache_infosimples
  FOR UPDATE
  USING (
    current_setting('role', true) = 'service_role' 
    OR (auth.jwt() ->> 'role') = 'service_role' 
    OR auth.uid() IS NULL
  );

CREATE POLICY "Bloquear delete direto no cache NFC-e InfoSimples"
  ON public.nfce_cache_infosimples
  FOR DELETE
  USING (false);