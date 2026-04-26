-- ============================================================
-- FRENTE 1 (parte DB): Backup table + trigger guard
-- ============================================================

-- 1. Tabela de backup/auditoria para rollback de limpeza de preços contaminados
CREATE TABLE IF NOT EXISTS public.precos_atuais_contaminados_backup (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  preco_atual_id UUID NOT NULL,
  dados_originais JSONB NOT NULL,
  motivo_remocao TEXT NOT NULL,
  audit_run_id UUID,
  removido_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  removido_por UUID,
  restaurado BOOLEAN NOT NULL DEFAULT false,
  restaurado_em TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_precos_backup_audit_run
  ON public.precos_atuais_contaminados_backup(audit_run_id);
CREATE INDEX IF NOT EXISTS idx_precos_backup_restaurado
  ON public.precos_atuais_contaminados_backup(restaurado) WHERE restaurado = false;

-- RLS: apenas masters
ALTER TABLE public.precos_atuais_contaminados_backup ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Masters podem ver backup contaminados"
  ON public.precos_atuais_contaminados_backup FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'master'::app_role));

CREATE POLICY "Service role gerencia backup contaminados"
  ON public.precos_atuais_contaminados_backup FOR ALL
  USING (current_setting('role', true) = 'service_role')
  WITH CHECK (current_setting('role', true) = 'service_role');

-- 2. Trigger LEVE: garante que produto_master_id nunca seja nulo em precos_atuais
CREATE OR REPLACE FUNCTION public.guard_precos_atuais_master_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.produto_master_id IS NULL THEN
    RAISE EXCEPTION 'precos_atuais: produto_master_id é obrigatório (matching estrito por master_id ou EAN). Use gravarPrecoSeguro().'
      USING ERRCODE = '23502';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_precos_atuais_master_id ON public.precos_atuais;
CREATE TRIGGER trg_guard_precos_atuais_master_id
  BEFORE INSERT OR UPDATE ON public.precos_atuais
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_precos_atuais_master_id();