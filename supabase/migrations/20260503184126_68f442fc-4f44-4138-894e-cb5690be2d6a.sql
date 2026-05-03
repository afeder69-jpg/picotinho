
-- RPC para anti-duplicata
CREATE OR REPLACE FUNCTION public.buscar_masters_similares(
  p_nome_base text,
  p_categoria text DEFAULT NULL,
  p_threshold real DEFAULT 0.75,
  p_limit int DEFAULT 5
)
RETURNS TABLE(
  id uuid,
  nome_padrao text,
  sku_global text,
  nome_base text,
  marca text,
  categoria text,
  qtd_base numeric,
  unidade_base text,
  provisorio boolean,
  similaridade real
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.id, m.nome_padrao, m.sku_global, m.nome_base, m.marca, m.categoria,
         m.qtd_base, m.unidade_base, m.provisorio,
         similarity(m.nome_base, p_nome_base) AS similaridade
  FROM produtos_master_global m
  WHERE m.status = 'ativo'
    AND m.nome_base IS NOT NULL
    AND (p_categoria IS NULL OR upper(m.categoria) = upper(p_categoria))
    AND similarity(m.nome_base, p_nome_base) >= p_threshold
  ORDER BY similaridade DESC
  LIMIT p_limit;
$$;

-- Promoção automática de master provisório baseada em ocorrências de notas distintas
CREATE OR REPLACE FUNCTION public.tg_master_provisorio_promocao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_min int;
  v_count int;
  v_provisorio boolean;
BEGIN
  IF NEW.produto_master_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.produto_master_id IS NOT DISTINCT FROM OLD.produto_master_id THEN
    RETURN NEW;
  END IF;

  SELECT provisorio INTO v_provisorio FROM produtos_master_global WHERE id = NEW.produto_master_id;
  IF v_provisorio IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE((valor)::text::int, 3) INTO v_min FROM app_config WHERE chave = 'master_promocao_min_notas';

  SELECT COUNT(DISTINCT nota_imagem_id) INTO v_count
  FROM estoque_app
  WHERE produto_master_id = NEW.produto_master_id
    AND nota_imagem_id IS NOT NULL;

  UPDATE produtos_master_global
  SET ocorrencias_notas = v_count
  WHERE id = NEW.produto_master_id;

  IF v_count >= v_min THEN
    UPDATE produtos_master_global
    SET provisorio = false,
        promovido_em = now(),
        promovido_por = 'auto_threshold'
    WHERE id = NEW.produto_master_id AND provisorio = true;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_master_provisorio_promocao ON public.estoque_app;
CREATE TRIGGER trg_master_provisorio_promocao
AFTER INSERT OR UPDATE OF produto_master_id ON public.estoque_app
FOR EACH ROW
EXECUTE FUNCTION public.tg_master_provisorio_promocao();
