-- Adicionar coluna nota_id na tabela estoque_app para vincular itens às notas originais
ALTER TABLE public.estoque_app
  ADD COLUMN IF NOT EXISTS nota_id uuid;

-- Criar índice para otimizar consultas por usuário e nota
CREATE INDEX IF NOT EXISTS idx_estoque_app_user_nota
  ON public.estoque_app(user_id, nota_id);