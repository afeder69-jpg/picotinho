
-- 1. Criar função auxiliar de normalização de categorias para estoque_app
-- Mapeia qualquer valor de categoria para uma das 11 canônicas em minúsculo
CREATE OR REPLACE FUNCTION public.normalizar_categoria_estoque(cat text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  RETURN CASE lower(trim(COALESCE(cat, '')))
    WHEN 'açougue'          THEN 'açougue'
    WHEN 'acougue'          THEN 'açougue'
    WHEN 'carnes'           THEN 'açougue'
    WHEN 'bebidas'          THEN 'bebidas'
    WHEN 'congelados'       THEN 'congelados'
    WHEN 'higiene'          THEN 'higiene/farmácia'
    WHEN 'higiene/farmácia' THEN 'higiene/farmácia'
    WHEN 'higiene/farmacia' THEN 'higiene/farmácia'
    WHEN 'farmácia'         THEN 'higiene/farmácia'
    WHEN 'farmacia'         THEN 'higiene/farmácia'
    WHEN 'hortifruti'       THEN 'hortifruti'
    WHEN 'frutas'           THEN 'hortifruti'
    WHEN 'verduras'         THEN 'hortifruti'
    WHEN 'legumes'          THEN 'hortifruti'
    WHEN 'laticínios/frios' THEN 'laticínios/frios'
    WHEN 'laticínios'       THEN 'laticínios/frios'
    WHEN 'laticinios'       THEN 'laticínios/frios'
    WHEN 'laticinios/frios' THEN 'laticínios/frios'
    WHEN 'frios'            THEN 'laticínios/frios'
    WHEN 'limpeza'          THEN 'limpeza'
    WHEN 'mercearia'        THEN 'mercearia'
    WHEN 'alimentos'        THEN 'mercearia'
    WHEN 'padaria'          THEN 'padaria'
    WHEN 'pet'              THEN 'pet'
    WHEN 'outros'           THEN 'outros'
    ELSE 'outros'
  END;
END;
$$;

-- 2. Recriar sync_candidato_aprovado usando normalizar_categoria_estoque
-- ÚNICA mudança: linha de categoria agora passa pela função de normalização
CREATE OR REPLACE FUNCTION public.sync_candidato_aprovado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Sincronizar SEMPRE que candidato for aprovado (auto ou manual)
  IF NEW.status IN ('auto_aprovado', 'aprovado') AND NEW.sugestao_produto_master IS NOT NULL THEN
    UPDATE estoque_app
    SET 
      produto_master_id = NEW.sugestao_produto_master,
      sku_global = (SELECT sku_global FROM produtos_master_global WHERE id = NEW.sugestao_produto_master),
      produto_nome_normalizado = (SELECT nome_padrao FROM produtos_master_global WHERE id = NEW.sugestao_produto_master),
      nome_base = (SELECT nome_base FROM produtos_master_global WHERE id = NEW.sugestao_produto_master),
      marca = COALESCE((SELECT marca FROM produtos_master_global WHERE id = NEW.sugestao_produto_master), estoque_app.marca),
      -- ✅ ÚNICA MUDANÇA: normalizar categoria antes de gravar
      categoria = normalizar_categoria_estoque((SELECT categoria FROM produtos_master_global WHERE id = NEW.sugestao_produto_master)),
      imagem_url = (SELECT imagem_url FROM produtos_master_global WHERE id = NEW.sugestao_produto_master),
      granel = COALESCE((SELECT granel FROM produtos_master_global WHERE id = NEW.sugestao_produto_master), estoque_app.granel),
      tipo_embalagem = COALESCE((SELECT tipo_embalagem FROM produtos_master_global WHERE id = NEW.sugestao_produto_master), estoque_app.tipo_embalagem),
      qtd_valor = COALESCE((SELECT qtd_valor FROM produtos_master_global WHERE id = NEW.sugestao_produto_master), estoque_app.qtd_valor),
      qtd_unidade = COALESCE((SELECT qtd_unidade FROM produtos_master_global WHERE id = NEW.sugestao_produto_master), estoque_app.qtd_unidade),
      qtd_base = COALESCE((SELECT qtd_base FROM produtos_master_global WHERE id = NEW.sugestao_produto_master), estoque_app.qtd_base),
      unidade_base = COALESCE((SELECT unidade_base FROM produtos_master_global WHERE id = NEW.sugestao_produto_master), estoque_app.unidade_base),
      updated_at = now()
    WHERE produto_candidato_id = NEW.id;
    
    RAISE NOTICE 'Estoque sincronizado com master para candidato %', NEW.id;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- 3. Recriar atualizar_estoque_apos_aprovacao_candidato usando normalizar_categoria_estoque
-- ÚNICA MUDANÇA: linha de categoria agora passa pela função de normalização
-- + WHERE categoria agora compara normalizado com normalizado
CREATE OR REPLACE FUNCTION public.atualizar_estoque_apos_aprovacao_candidato()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  master_record RECORD;
  produtos_atualizados INT := 0;
BEGIN
  -- Só executar se status mudou para 'aprovado' e tem master vinculado
  IF NEW.status = 'aprovado' AND 
     NEW.sugestao_produto_master IS NOT NULL AND
     (OLD.status IS NULL OR OLD.status != 'aprovado') THEN
    
    -- Buscar dados do master aprovado
    SELECT * INTO master_record
    FROM produtos_master_global
    WHERE id = NEW.sugestao_produto_master;
    
    IF FOUND THEN
      -- Atualizar estoque com fuzzy match (threshold 80%)
      UPDATE estoque_app
      SET 
        sku_global = master_record.sku_global,
        produto_master_id = master_record.id,
        produto_nome = master_record.nome_padrao,
        marca = master_record.marca,
        -- ✅ ÚNICA MUDANÇA: normalizar categoria antes de gravar
        categoria = normalizar_categoria_estoque(master_record.categoria),
        produto_nome_normalizado = master_record.nome_padrao,
        nome_base = master_record.nome_base,
        updated_at = now()
      WHERE 
        sku_global IS NULL
        -- ✅ Comparar categorias normalizadas para match correto
        AND normalizar_categoria_estoque(categoria) = normalizar_categoria_estoque(master_record.categoria)
        AND (
          -- Fuzzy match: nome similar ao texto original ou nome padrao
          similarity(UPPER(produto_nome), UPPER(NEW.texto_original)) > 0.80
          OR similarity(UPPER(produto_nome), UPPER(master_record.nome_padrao)) > 0.80
        );
      
      GET DIAGNOSTICS produtos_atualizados = ROW_COUNT;
      
      RAISE NOTICE '✅ Trigger: % produtos atualizados para master % (SKU: %)', 
        produtos_atualizados, 
        master_record.nome_padrao,
        master_record.sku_global;
    END IF;
  END IF;
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- 🛡️ FALLBACK: Log erro mas não falha a transação
    RAISE WARNING '⚠️ Erro no trigger de atualização de estoque: %', SQLERRM;
    RETURN NEW;
END;
$function$;
