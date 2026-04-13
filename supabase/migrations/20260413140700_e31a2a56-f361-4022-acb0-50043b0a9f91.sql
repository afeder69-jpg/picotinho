
-- 1. Adicionar colunas de preferências e nome_pessoa
ALTER TABLE public.whatsapp_telefones_autorizados
  ADD COLUMN IF NOT EXISTS pref_promocoes boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS pref_novidades boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS pref_avisos_estoque boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS pref_dicas boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS nome_pessoa text;

-- 2. Criar enum controlado para tipo de mensagem proativa
DO $$ BEGIN
  CREATE TYPE tipo_mensagem_proativa AS ENUM ('promocao', 'novidade', 'aviso_estoque', 'dica');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 3. Adicionar coluna tipo_mensagem na tabela campanhas_whatsapp
ALTER TABLE public.campanhas_whatsapp
  ADD COLUMN IF NOT EXISTS tipo_mensagem tipo_mensagem_proativa;

-- 4. Criar função utilitária para verificar preferência de um telefone
CREATE OR REPLACE FUNCTION public.verificar_preferencia_telefone(
  p_telefone text,
  p_tipo tipo_mensagem_proativa
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_telefone_limpo text;
  v_resultado boolean;
BEGIN
  -- Normalizar telefone: remover +, espaços, hifens, parênteses
  v_telefone_limpo := regexp_replace(p_telefone, '[^0-9]', '', 'g');

  SELECT
    CASE p_tipo
      WHEN 'promocao' THEN pref_promocoes
      WHEN 'novidade' THEN pref_novidades
      WHEN 'aviso_estoque' THEN pref_avisos_estoque
      WHEN 'dica' THEN pref_dicas
    END
  INTO v_resultado
  FROM public.whatsapp_telefones_autorizados
  WHERE regexp_replace(telefone, '[^0-9]', '', 'g') = v_telefone_limpo
    AND verificado = true
    AND ativo = true
  LIMIT 1;

  RETURN COALESCE(v_resultado, false);
END;
$$;

-- 5. Trigger para updated_at (usando a função set_updated_at já existente)
DROP TRIGGER IF EXISTS trg_updated_at_whatsapp_telefones ON public.whatsapp_telefones_autorizados;
CREATE TRIGGER trg_updated_at_whatsapp_telefones
  BEFORE UPDATE ON public.whatsapp_telefones_autorizados
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
