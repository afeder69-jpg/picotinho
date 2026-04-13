
-- Adicionar coluna envio_emergencial na tabela de campanhas
ALTER TABLE public.campanhas_whatsapp 
ADD COLUMN IF NOT EXISTS envio_emergencial boolean NOT NULL DEFAULT false;

-- Criar tabela de auditoria para envios emergenciais
CREATE TABLE IF NOT EXISTS public.campanhas_whatsapp_auditoria_emergencial (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campanha_id uuid NOT NULL REFERENCES public.campanhas_whatsapp(id) ON DELETE CASCADE,
  campanha_titulo text NOT NULL,
  campanha_mensagem_preview text,
  master_id uuid NOT NULL REFERENCES auth.users(id),
  tipo_mensagem public.tipo_mensagem_proativa NOT NULL,
  total_destinatarios integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.campanhas_whatsapp_auditoria_emergencial ENABLE ROW LEVEL SECURITY;

-- Política: apenas masters podem visualizar registros de auditoria
CREATE POLICY "Masters podem visualizar auditoria emergencial"
ON public.campanhas_whatsapp_auditoria_emergencial
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'master'));

-- Política: apenas masters podem inserir registros de auditoria
CREATE POLICY "Masters podem inserir auditoria emergencial"
ON public.campanhas_whatsapp_auditoria_emergencial
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'master'));

-- Índice para consultas por campanha
CREATE INDEX IF NOT EXISTS idx_auditoria_emergencial_campanha 
ON public.campanhas_whatsapp_auditoria_emergencial(campanha_id);

-- Índice para consultas por master
CREATE INDEX IF NOT EXISTS idx_auditoria_emergencial_master 
ON public.campanhas_whatsapp_auditoria_emergencial(master_id);
