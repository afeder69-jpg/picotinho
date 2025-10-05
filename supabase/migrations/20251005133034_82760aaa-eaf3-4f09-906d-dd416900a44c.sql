-- Criar tabela de controle de importações Open Food Facts
CREATE TABLE IF NOT EXISTS public.open_food_facts_controle (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pagina INTEGER NOT NULL,
  limite INTEGER NOT NULL DEFAULT 50,
  com_imagem BOOLEAN NOT NULL DEFAULT true,
  total_produtos_retornados INTEGER NOT NULL DEFAULT 0,
  produtos_importados INTEGER NOT NULL DEFAULT 0,
  produtos_duplicados INTEGER NOT NULL DEFAULT 0,
  produtos_erros INTEGER NOT NULL DEFAULT 0,
  importado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Criar índice para consultas rápidas por página
CREATE INDEX IF NOT EXISTS idx_off_controle_pagina ON public.open_food_facts_controle(pagina DESC);

-- Habilitar RLS
ALTER TABLE public.open_food_facts_controle ENABLE ROW LEVEL SECURITY;

-- Masters podem ver o controle
CREATE POLICY "Masters podem ver controle de importações"
ON public.open_food_facts_controle
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'master'));

-- Sistema pode inserir registros de controle
CREATE POLICY "Sistema pode inserir controle"
ON public.open_food_facts_controle
FOR INSERT
TO authenticated
WITH CHECK (true);