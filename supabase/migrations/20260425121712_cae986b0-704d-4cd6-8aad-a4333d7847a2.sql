-- =========================================================================
-- FASE 1: TRAVA DE SEGURANÇA CONTRA EXCLUSÃO EM MASSA DE ESTOQUE
-- =========================================================================

-- ---------- 1. NEUTRALIZAR RPCs PERIGOSAS ----------

CREATE OR REPLACE FUNCTION public.limpar_estoque_completo_usuario()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RAISE EXCEPTION 'DESATIVADA POR SEGURANCA: limpar_estoque_completo_usuario nao pode mais executar DELETE em massa. Use limpar_estoque_usuario(uuid) para zerar quantidades preservando o historico.';
END;
$function$;

CREATE OR REPLACE FUNCTION public.limpar_dados_usuario_completo()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RAISE EXCEPTION 'DESATIVADA POR SEGURANCA: limpar_dados_usuario_completo executava DELETE em massa em estoque_app, notas, receipts. Exclusao total de conta deve ser fluxo explicito e separado.';
END;
$function$;

CREATE OR REPLACE FUNCTION public.limpar_residuos_usuario_completo(target_user_id uuid)
RETURNS TABLE(tabela_limpa text, registros_removidos integer, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RAISE EXCEPTION 'DESATIVADA POR SEGURANCA: limpar_residuos_usuario_completo executava DELETE em massa em estoque_app e dezenas de outras tabelas. Use ferramentas pontuais e auditadas.';
END;
$function$;

CREATE OR REPLACE FUNCTION public.limpar_duplicados_estoque_temporario()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RAISE EXCEPTION 'DESATIVADA POR SEGURANCA: limpar_duplicados_estoque_temporario tinha user_id hard-coded e fazia DELETE em estoque_app.';
END;
$function$;

CREATE OR REPLACE FUNCTION public.recalcular_estoque_usuario(usuario_uuid uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  RAISE EXCEPTION 'DESATIVADA POR SEGURANCA: recalcular_estoque_usuario executava DELETE FROM estoque_app antes de reconstruir, com logica de normalizacao defasada. Use o pipeline atual process-receipt-full por nota.';
END;
$function$;

CREATE OR REPLACE FUNCTION public.recalcular_estoque_completo()
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  RAISE EXCEPTION 'DESATIVADA POR SEGURANCA: recalcular_estoque_completo executava DELETE FROM estoque_app de TODOS os usuarios. Operacao proibida.';
END;
$function$;

-- ---------- 2. REVOGAR EXECUTE PUBLICO ----------

REVOKE ALL ON FUNCTION public.limpar_estoque_completo_usuario() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.limpar_dados_usuario_completo() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.limpar_residuos_usuario_completo(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.limpar_duplicados_estoque_temporario() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recalcular_estoque_usuario(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recalcular_estoque_completo() FROM PUBLIC, anon, authenticated;

-- ---------- 3. TRIGGER GUARD-RAIL EM estoque_app ----------

CREATE OR REPLACE FUNCTION public.estoque_app_block_bulk_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_allow_bulk text;
BEGIN
  -- Valvula explicita para futuro fluxo de exclusao total de conta
  BEGIN
    v_allow_bulk := current_setting('app.allow_bulk_delete', true);
  EXCEPTION WHEN OTHERS THEN
    v_allow_bulk := NULL;
  END;

  IF v_allow_bulk = 'true' THEN
    RETURN OLD;
  END IF;

  -- Permitir DELETE escopado por nota (reprocessamento via process-receipt-full)
  IF OLD.nota_id IS NOT NULL THEN
    RETURN OLD;
  END IF;

  -- Caso contrario: bloquear
  RAISE EXCEPTION 'DELETE em massa de estoque_app bloqueado pela trava de seguranca (registro id=%, user_id=%). Use UPDATE quantidade=0 (limpar_estoque_usuario) ou ative app.allow_bulk_delete em fluxo de exclusao total de conta.',
    OLD.id, OLD.user_id;
END;
$function$;

DROP TRIGGER IF EXISTS estoque_app_block_bulk_delete_trg ON public.estoque_app;

CREATE TRIGGER estoque_app_block_bulk_delete_trg
BEFORE DELETE ON public.estoque_app
FOR EACH ROW
EXECUTE FUNCTION public.estoque_app_block_bulk_delete();

-- Comentario documental
COMMENT ON FUNCTION public.estoque_app_block_bulk_delete() IS
'Trava de seguranca: bloqueia DELETE em estoque_app exceto quando OLD.nota_id IS NOT NULL (reprocessamento por nota) ou quando app.allow_bulk_delete=true (exclusao total de conta explicita).';

COMMENT ON FUNCTION public.limpar_estoque_usuario(uuid) IS
'Funcao SEGURA: zera quantidades preservando historico. Esta e a UNICA forma autorizada de limpar estoque pelo botao da UI.';