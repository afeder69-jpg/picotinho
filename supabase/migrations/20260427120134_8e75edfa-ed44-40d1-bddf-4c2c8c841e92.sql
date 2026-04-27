-- Funções utilitárias temporárias para gravar/atualizar o secret do cron no Vault.
-- Restritas ao service_role; serão removidas após o uso único pela edge function copy-cron-secret-to-vault.

CREATE OR REPLACE FUNCTION public.vault_create_cron_secret(p_value text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT vault.create_secret(p_value, 'CRON_NOTIFICACOES_SECRET') INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.vault_create_cron_secret(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vault_create_cron_secret(text) TO service_role;

CREATE OR REPLACE FUNCTION public.vault_update_cron_secret(p_value text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM vault.secrets WHERE name = 'CRON_NOTIFICACOES_SECRET' LIMIT 1;
  IF v_id IS NULL THEN
    PERFORM vault.create_secret(p_value, 'CRON_NOTIFICACOES_SECRET');
  ELSE
    PERFORM vault.update_secret(v_id, p_value, 'CRON_NOTIFICACOES_SECRET');
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.vault_update_cron_secret(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vault_update_cron_secret(text) TO service_role;