-- Criar função auxiliar para normalização de texto na comparação
CREATE OR REPLACE FUNCTION normalizar_texto_similaridade(texto text)
RETURNS text AS $$
BEGIN
  IF texto IS NULL THEN
    RETURN '';
  END IF;
  
  RETURN UPPER(TRIM(
    REGEXP_REPLACE(
      REGEXP_REPLACE(texto, '[^\w\s]', '', 'g'),
      '\s+', ' ', 'g'
    )
  ));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Criar/atualizar função de comparação de similaridade entre masters
-- Agora considera: nome (50%), marca (30%), quantidade (20%)
CREATE OR REPLACE FUNCTION comparar_masters_similares(
    m1_nome text,
    m1_marca text,
    m1_qtd_valor numeric,
    m1_qtd_unidade text,
    m2_nome text,
    m2_marca text,
    m2_qtd_valor numeric,
    m2_qtd_unidade text
) RETURNS numeric AS $$
DECLARE
    score_nome numeric := 0;
    score_marca numeric := 0;
    score_quantidade numeric := 0;
    score_final numeric := 0;
    diff_percentual numeric;
BEGIN
    -- Score do nome (50% do peso total - reduzido de 70%)
    score_nome := similarity(
        normalizar_texto_similaridade(m1_nome),
        normalizar_texto_similaridade(m2_nome)
    ) * 0.5;
    
    -- Score da marca (30% do peso total)
    IF m1_marca IS NOT NULL AND m2_marca IS NOT NULL THEN
        score_marca := similarity(
            normalizar_texto_similaridade(m1_marca),
            normalizar_texto_similaridade(m2_marca)
        ) * 0.3;
    ELSE
        score_marca := 0;
    END IF;
    
    -- Score da quantidade (20% do peso total - NOVO)
    IF m1_qtd_valor IS NOT NULL AND m2_qtd_valor IS NOT NULL 
       AND m1_qtd_unidade IS NOT NULL AND m2_qtd_unidade IS NOT NULL THEN
        
        -- Se unidades diferentes → produtos claramente diferentes (score 0)
        IF UPPER(TRIM(m1_qtd_unidade)) != UPPER(TRIM(m2_qtd_unidade)) THEN
            score_quantidade := 0;
        ELSE
            -- Calcular diferença percentual entre quantidades
            diff_percentual := ABS(m1_qtd_valor - m2_qtd_valor) / GREATEST(m1_qtd_valor, m2_qtd_valor);
            
            -- Se diferença > 15% → produtos diferentes (ex: 50G vs 100G)
            IF diff_percentual > 0.15 THEN
                score_quantidade := 0;
            ELSE
                -- Quanto menor a diferença, maior o score
                -- Ex: 495G vs 500G (1% diff) → score alto
                -- Ex: 480G vs 500G (4% diff) → score médio
                score_quantidade := (1 - diff_percentual) * 0.2;
            END IF;
        END IF;
    ELSE
        -- Se não tem quantidade definida, assume score neutro baixo
        score_quantidade := 0.1;
    END IF;
    
    score_final := score_nome + score_marca + score_quantidade;
    
    RETURN score_final;
END;
$$ LANGUAGE plpgsql IMMUTABLE;