-- 1. Função centralizada de sincronização master → estoque_app
CREATE OR REPLACE FUNCTION public.sync_estoque_from_master(p_master_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
  v_master record;
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

  UPDATE estoque_app
  SET
    produto_nome = v_master.nome_padrao,
    produto_nome_normalizado = v_master.nome_padrao,
    categoria = LOWER(COALESCE(v_master.categoria, categoria)),
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

-- 2. Trigger function
CREATE OR REPLACE FUNCTION public.trg_sync_master_to_estoque()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (
    OLD.nome_padrao IS DISTINCT FROM NEW.nome_padrao OR
    OLD.categoria IS DISTINCT FROM NEW.categoria OR
    OLD.codigo_barras IS DISTINCT FROM NEW.codigo_barras OR
    OLD.sku_global IS DISTINCT FROM NEW.sku_global OR
    OLD.nome_base IS DISTINCT FROM NEW.nome_base OR
    OLD.marca IS DISTINCT FROM NEW.marca OR
    OLD.imagem_url IS DISTINCT FROM NEW.imagem_url OR
    OLD.tipo_embalagem IS DISTINCT FROM NEW.tipo_embalagem OR
    OLD.qtd_valor IS DISTINCT FROM NEW.qtd_valor OR
    OLD.qtd_unidade IS DISTINCT FROM NEW.qtd_unidade OR
    OLD.qtd_base IS DISTINCT FROM NEW.qtd_base OR
    OLD.unidade_base IS DISTINCT FROM NEW.unidade_base OR
    OLD.granel IS DISTINCT FROM NEW.granel
  ) THEN
    PERFORM sync_estoque_from_master(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

-- 3. Trigger AFTER UPDATE
DROP TRIGGER IF EXISTS trg_sync_master_to_estoque ON produtos_master_global;
CREATE TRIGGER trg_sync_master_to_estoque
  AFTER UPDATE ON produtos_master_global
  FOR EACH ROW
  EXECUTE FUNCTION trg_sync_master_to_estoque();