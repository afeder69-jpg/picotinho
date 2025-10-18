-- Tabela para armazenar pares de produtos que foram analisados e marcados como NÃO-DUPLICATAS
CREATE TABLE public.masters_duplicatas_ignoradas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_1_id UUID NOT NULL REFERENCES produtos_master_global(id) ON DELETE CASCADE,
  produto_2_id UUID NOT NULL REFERENCES produtos_master_global(id) ON DELETE CASCADE,
  decidido_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  decidido_em TIMESTAMP WITH TIME ZONE DEFAULT now(),
  observacao TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  -- Constraint para garantir que a mesma dupla não seja inserida duas vezes
  CONSTRAINT unique_pair CHECK (produto_1_id < produto_2_id),
  CONSTRAINT different_products CHECK (produto_1_id <> produto_2_id)
);

-- Índices para otimizar consultas
CREATE INDEX idx_masters_duplicatas_produto_1 ON masters_duplicatas_ignoradas(produto_1_id);
CREATE INDEX idx_masters_duplicatas_produto_2 ON masters_duplicatas_ignoradas(produto_2_id);
CREATE UNIQUE INDEX idx_masters_duplicatas_pair ON masters_duplicatas_ignoradas(produto_1_id, produto_2_id);

-- RLS Policies
ALTER TABLE public.masters_duplicatas_ignoradas ENABLE ROW LEVEL SECURITY;

-- Masters podem ver todas as decisões de ignorar
CREATE POLICY "Masters podem ver decisões de ignorar" ON masters_duplicatas_ignoradas
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'master'));

-- Masters podem inserir novas decisões
CREATE POLICY "Masters podem inserir decisões" ON masters_duplicatas_ignoradas
  FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'master'));

-- Masters podem deletar decisões antigas (caso mudem de ideia)
CREATE POLICY "Masters podem deletar decisões" ON masters_duplicatas_ignoradas
  FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'master'));

COMMENT ON TABLE masters_duplicatas_ignoradas IS 'Armazena pares de produtos master que foram analisados e decididos como NÃO sendo duplicatas';