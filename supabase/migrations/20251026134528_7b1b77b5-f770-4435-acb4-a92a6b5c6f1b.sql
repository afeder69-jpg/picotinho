-- Tabela de cache para consultas NFe Serpro
-- Cache persiste mesmo após exclusão de notas (economia de créditos)
CREATE TABLE IF NOT EXISTS public.nfe_cache_serpro (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chave_nfe TEXT NOT NULL UNIQUE, -- Chave de 44 dígitos
  
  -- Dados da NFe
  cnpj_emitente TEXT,
  nome_emitente TEXT,
  data_emissao TIMESTAMP WITH TIME ZONE,
  valor_total NUMERIC,
  
  -- Dados completos da API Serpro
  dados_completos JSONB NOT NULL,
  
  -- Metadados de cache
  consultado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  total_consultas INTEGER NOT NULL DEFAULT 1,
  ultima_consulta TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_nfe_cache_chave ON public.nfe_cache_serpro(chave_nfe);
CREATE INDEX IF NOT EXISTS idx_nfe_cache_cnpj ON public.nfe_cache_serpro(cnpj_emitente);
CREATE INDEX IF NOT EXISTS idx_nfe_cache_data ON public.nfe_cache_serpro(data_emissao);

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_nfe_cache_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER nfe_cache_updated_at
  BEFORE UPDATE ON public.nfe_cache_serpro
  FOR EACH ROW
  EXECUTE FUNCTION update_nfe_cache_updated_at();

-- Comentários
COMMENT ON TABLE public.nfe_cache_serpro IS 'Cache persistente de consultas à API Serpro - economiza créditos em re-leituras';
COMMENT ON COLUMN public.nfe_cache_serpro.chave_nfe IS 'Chave de acesso de 44 dígitos da NFe';
COMMENT ON COLUMN public.nfe_cache_serpro.total_consultas IS 'Quantas vezes esta NFe foi consultada';
COMMENT ON COLUMN public.nfe_cache_serpro.dados_completos IS 'JSON completo retornado pela API Serpro';