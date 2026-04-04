
-- 1. Coluna total_reenvios em campanhas_whatsapp
ALTER TABLE campanhas_whatsapp ADD COLUMN IF NOT EXISTS total_reenvios integer NOT NULL DEFAULT 0;

-- 2. Tabela de histórico de disparos
CREATE TABLE IF NOT EXISTS campanhas_whatsapp_disparos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campanha_id uuid NOT NULL REFERENCES campanhas_whatsapp(id) ON DELETE CASCADE,
  iniciado_em timestamptz NOT NULL DEFAULT now(),
  concluido_em timestamptz,
  total_enviados integer NOT NULL DEFAULT 0,
  total_falhas integer NOT NULL DEFAULT 0,
  total_destinatarios integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'enviando'
);

ALTER TABLE campanhas_whatsapp_disparos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Masters podem gerenciar disparos"
  ON campanhas_whatsapp_disparos FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'master'));

-- 3. Policy DELETE em campanhas_whatsapp_envios para masters
CREATE POLICY "Masters podem deletar envios"
  ON campanhas_whatsapp_envios FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'master'));
