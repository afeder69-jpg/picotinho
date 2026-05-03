
-- 1. Master provisório
ALTER TABLE public.produtos_master_global
  ADD COLUMN IF NOT EXISTS provisorio boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ocorrencias_notas int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS promovido_em timestamptz,
  ADD COLUMN IF NOT EXISTS promovido_por text;

CREATE INDEX IF NOT EXISTS ix_master_provisorio
  ON public.produtos_master_global(provisorio)
  WHERE provisorio = true;

-- 2. Candidatos: motivo de bloqueio + candidatos próximos
ALTER TABLE public.produtos_candidatos_normalizacao
  ADD COLUMN IF NOT EXISTS motivo_bloqueio text,
  ADD COLUMN IF NOT EXISTS candidatos_proximos jsonb;

-- 3. App config
INSERT INTO public.app_config(chave, valor)
VALUES ('normalizacao_orfaos_pausado', 'true'::jsonb)
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor;

INSERT INTO public.app_config(chave, valor)
VALUES ('master_promocao_min_notas', '3'::jsonb)
ON CONFLICT (chave) DO NOTHING;

-- 4. RPC upsert_produto_master ganha p_provisorio
CREATE OR REPLACE FUNCTION public.upsert_produto_master(
  p_sku_global text, p_nome_padrao text, p_nome_base text, p_categoria text,
  p_qtd_valor numeric, p_qtd_unidade text, p_qtd_base numeric, p_unidade_base text, p_categoria_unidade text,
  p_granel boolean, p_marca text, p_tipo_embalagem text, p_imagem_url text, p_imagem_path text,
  p_confianca numeric, p_codigo_barras text DEFAULT NULL::text,
  p_provisorio boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_produto RECORD;
  v_operacao TEXT;
  v_id UUID;
BEGIN
  SELECT * INTO v_produto FROM produtos_master_global WHERE sku_global = p_sku_global FOR UPDATE;

  IF FOUND THEN
    UPDATE produtos_master_global SET
      nome_padrao = p_nome_padrao,
      nome_base = p_nome_base,
      categoria = p_categoria,
      qtd_valor = p_qtd_valor,
      qtd_unidade = p_qtd_unidade,
      qtd_base = p_qtd_base,
      unidade_base = p_unidade_base,
      categoria_unidade = p_categoria_unidade,
      granel = p_granel,
      marca = COALESCE(p_marca, marca),
      tipo_embalagem = COALESCE(p_tipo_embalagem, tipo_embalagem),
      imagem_url = COALESCE(p_imagem_url, imagem_url),
      imagem_path = COALESCE(p_imagem_path, imagem_path),
      confianca_normalizacao = GREATEST(p_confianca, COALESCE(confianca_normalizacao, 0)),
      codigo_barras = COALESCE(p_codigo_barras, codigo_barras),
      total_usuarios = COALESCE(total_usuarios, 0) + 1,
      total_notas = COALESCE(total_notas, 0) + 1,
      updated_at = NOW(),
      status = 'ativo'
    WHERE sku_global = p_sku_global;
    v_operacao := 'UPDATE';
    v_id := v_produto.id;
  ELSE
    INSERT INTO produtos_master_global (
      sku_global, nome_padrao, nome_base, categoria,
      qtd_valor, qtd_unidade, qtd_base, unidade_base, categoria_unidade,
      granel, marca, tipo_embalagem, imagem_url, imagem_path,
      confianca_normalizacao, codigo_barras, total_usuarios, total_notas, status,
      provisorio
    ) VALUES (
      p_sku_global, p_nome_padrao, p_nome_base, p_categoria,
      p_qtd_valor, p_qtd_unidade, p_qtd_base, p_unidade_base, p_categoria_unidade,
      p_granel, p_marca, p_tipo_embalagem, p_imagem_url, p_imagem_path,
      p_confianca, p_codigo_barras, 1, 1, 'ativo',
      COALESCE(p_provisorio, false)
    )
    RETURNING id INTO v_id;
    v_operacao := 'INSERT';
  END IF;

  RETURN jsonb_build_object('operacao', v_operacao, 'sku_global', p_sku_global, 'id', v_id);
END;
$function$;

-- 5. Marcar os 26 masters da 1ª rodada como provisórios (limpeza retroativa)
UPDATE public.produtos_master_global
SET provisorio = true
WHERE created_at > now() - interval '6 hours'
  AND provisorio = false;
