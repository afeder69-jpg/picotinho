-- Atualizar função upsert_produto_master: adicionar codigo_barras e retornar id
DROP FUNCTION IF EXISTS public.upsert_produto_master(TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, NUMERIC, TEXT, TEXT, BOOLEAN, TEXT, TEXT, TEXT, TEXT, NUMERIC);

CREATE OR REPLACE FUNCTION public.upsert_produto_master(
  p_sku_global TEXT,
  p_nome_padrao TEXT,
  p_nome_base TEXT,
  p_categoria TEXT,
  p_qtd_valor NUMERIC,
  p_qtd_unidade TEXT,
  p_qtd_base NUMERIC,
  p_unidade_base TEXT,
  p_categoria_unidade TEXT,
  p_granel BOOLEAN,
  p_marca TEXT,
  p_tipo_embalagem TEXT,
  p_imagem_url TEXT,
  p_imagem_path TEXT,
  p_confianca NUMERIC,
  p_codigo_barras TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_produto RECORD;
  v_operacao TEXT;
  v_id UUID;
BEGIN
  SELECT * INTO v_produto 
  FROM produtos_master_global 
  WHERE sku_global = p_sku_global
  FOR UPDATE;

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
      confianca_normalizacao, codigo_barras, total_usuarios, total_notas, status
    ) VALUES (
      p_sku_global, p_nome_padrao, p_nome_base, p_categoria,
      p_qtd_valor, p_qtd_unidade, p_qtd_base, p_unidade_base, p_categoria_unidade,
      p_granel, p_marca, p_tipo_embalagem, p_imagem_url, p_imagem_path,
      p_confianca, p_codigo_barras, 1, 1, 'ativo'
    )
    RETURNING id INTO v_id;
    
    v_operacao := 'INSERT';
  END IF;

  RETURN jsonb_build_object(
    'operacao', v_operacao,
    'sku_global', p_sku_global,
    'id', v_id,
    'mensagem', format('Produto %s: %s', LOWER(v_operacao), p_nome_padrao)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Recalcular contadores existentes com dados reais
UPDATE produtos_master_global pmg SET
  total_notas = sub.real_notas,
  total_usuarios = sub.real_usuarios
FROM (
  SELECT 
    produto_master_id,
    COUNT(*) as real_notas,
    COUNT(DISTINCT user_id) as real_usuarios
  FROM estoque_app 
  WHERE produto_master_id IS NOT NULL
  GROUP BY produto_master_id
) sub
WHERE pmg.id = sub.produto_master_id
  AND (COALESCE(pmg.total_notas, 0) != sub.real_notas 
    OR COALESCE(pmg.total_usuarios, 0) != sub.real_usuarios);