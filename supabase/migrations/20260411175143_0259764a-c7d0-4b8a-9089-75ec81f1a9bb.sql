
-- =====================================================
-- ETAPA 1: Desativar regras conflitantes e duplicatas
-- =====================================================

-- Manteiga: desativar a regra errada (destino PADARIA) e as duplicatas
-- Manter apenas 981ade25 (global, sem restrição de origem, destino LATICÍNIOS/FRIOS)
UPDATE public.regras_recategorizacao SET ativa = false, updated_at = now()
WHERE id IN (
  '995bd272-f895-493e-954f-3e613e64d0d0',  -- manteiga → PADARIA (errada)
  'fc62d687-1cdf-409b-a7c2-022763300481',  -- Manteiga duplicata
  '5d5392b2-52f5-4d58-a9ab-7e6a18e8c54e'   -- Manteiga duplicata
);

-- Abóbora: desativar duplicata (manter 31beb34c com "Abobora")
UPDATE public.regras_recategorizacao SET ativa = false, updated_at = now()
WHERE id = '0e997df6-cd69-4c91-b954-ebaf91c01755';

-- Mamão: desativar duplicata (manter 675593da global com "Mamao")
UPDATE public.regras_recategorizacao SET ativa = false, updated_at = now()
WHERE id = 'b1328fb1-95cd-4c67-bd05-b8bc6e451c45';

-- Rúcula: desativar duplicata com restrição (manter 63e71fd1 global)
UPDATE public.regras_recategorizacao SET ativa = false, updated_at = now()
WHERE id = '3e53af4b-1b32-449a-b815-cb8562b31740';

-- Suco concentrado: desativar duplicata (manter cdbbb141)
UPDATE public.regras_recategorizacao SET ativa = false, updated_at = now()
WHERE id = '8ff40720-2f9a-445e-a2d6-0148cfdbba23';

-- Suco BEBIDAS→BEBIDAS: regra inútil, desativar
UPDATE public.regras_recategorizacao SET ativa = false, updated_at = now()
WHERE id = '88da08eb-282b-495f-8d5a-9f5566ad2ccd';

-- =====================================================
-- ETAPA 2: Função auxiliar para normalizar texto (remover acentos, lowercase)
-- =====================================================

CREATE OR REPLACE FUNCTION public.normalize_keyword(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT lower(
    translate(
      input,
      'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
      'aaaaaeeeeiiiioooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'
    )
  );
$$;

-- =====================================================
-- ETAPA 3: Trigger para prevenir conflitos de regras
-- =====================================================

CREATE OR REPLACE FUNCTION public.validate_regra_recategorizacao_conflito()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  new_keyword text;
  existing_destino text;
  existing_id uuid;
BEGIN
  -- Só validar se a regra está sendo ativada
  IF NEW.ativa = false THEN
    RETURN NEW;
  END IF;

  -- Para cada keyword da nova regra, verificar conflito
  FOREACH new_keyword IN ARRAY NEW.keywords
  LOOP
    SELECT r.categoria_destino, r.id
    INTO existing_destino, existing_id
    FROM public.regras_recategorizacao r,
         LATERAL unnest(r.keywords) AS kw(keyword)
    WHERE r.ativa = true
      AND r.id IS DISTINCT FROM NEW.id
      AND public.normalize_keyword(kw.keyword) = public.normalize_keyword(new_keyword)
      AND upper(r.categoria_destino) != upper(NEW.categoria_destino)
    LIMIT 1;

    IF existing_destino IS NOT NULL THEN
      RAISE EXCEPTION 'Conflito de regra: a keyword "%" já existe em outra regra ativa (id: %) com destino diferente (%). Destino solicitado: %. Desative a regra conflitante antes de ativar esta.',
        new_keyword, existing_id, existing_destino, NEW.categoria_destino;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

-- Criar o trigger
DROP TRIGGER IF EXISTS trg_validate_regra_conflito ON public.regras_recategorizacao;
CREATE TRIGGER trg_validate_regra_conflito
  BEFORE INSERT OR UPDATE ON public.regras_recategorizacao
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_regra_recategorizacao_conflito();
