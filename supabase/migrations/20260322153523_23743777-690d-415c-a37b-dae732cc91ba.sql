-- Atualizar função de sync para normalizar categorias ao domínio válido do estoque_app
CREATE OR REPLACE FUNCTION public.sync_estoque_from_master(p_master_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
  v_master record;
  v_categoria_normalizada text;
BEGIN
  SELECT 
    nome_padrao, categoria, codigo_barras, sku_global,
    nome_base, marca, imagem_url, tipo_embalagem,
    qtd_valor, qtd_unidade, qtd_base, unidade_base, granel
  INTO v_master
  FROM produtos_master_global
  WHERE id = p_master_id;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  -- Mapear categoria do master para o domínio válido do estoque_app
  v_categoria_normalizada := CASE LOWER(COALESCE(v_master.categoria, 'outros'))
    WHEN 'hortifruti' THEN 'hortifruti'
    WHEN 'mercearia' THEN 'mercearia'
    WHEN 'bebidas' THEN 'bebidas'
    WHEN 'laticínios/frios' THEN 'laticínios/frios'
    WHEN 'limpeza' THEN 'limpeza'
    WHEN 'higiene/farmácia' THEN 'higiene/farmácia'
    WHEN 'açougue' THEN 'açougue'
    WHEN 'padaria' THEN 'padaria'
    WHEN 'congelados' THEN 'congelados'
    WHEN 'pet' THEN 'pet'
    WHEN 'alimentos' THEN 'mercearia'
    ELSE 'outros'
  END;

  UPDATE estoque_app
  SET
    produto_nome = v_master.nome_padrao,
    produto_nome_normalizado = v_master.nome_padrao,
    categoria = v_categoria_normalizada,
    ean_comercial = v_master.codigo_barras,
    sku_global = v_master.sku_global,
    nome_base = v_master.nome_base,
    marca = v_master.marca,
    imagem_url = v_master.imagem_url,
    tipo_embalagem = v_master.tipo_embalagem,
    qtd_valor = v_master.qtd_valor,
    qtd_unidade = v_master.qtd_unidade,
    qtd_base = v_master.qtd_base,
    unidade_base = v_master.unidade_base,
    granel = COALESCE(v_master.granel, granel),
    updated_at = now()
  WHERE produto_master_id = p_master_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Agora rodar o backfill
DO $$
DECLARE
  v_master_id uuid;
  v_total integer := 0;
  v_count integer;
BEGIN
  FOR v_master_id IN
    SELECT DISTINCT produto_master_id 
    FROM estoque_app 
    WHERE produto_master_id IS NOT NULL
  LOOP
    v_count := public.sync_estoque_from_master(v_master_id);
    v_total := v_total + v_count;
  END LOOP;

  RAISE NOTICE 'Backfill concluído: % registros sincronizados', v_total;
END;
$$;