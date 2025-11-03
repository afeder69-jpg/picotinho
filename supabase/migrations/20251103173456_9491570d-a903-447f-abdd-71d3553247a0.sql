-- Adicionar coluna cnpj_original à tabela normalizacoes_estabelecimentos
ALTER TABLE normalizacoes_estabelecimentos 
ADD COLUMN IF NOT EXISTS cnpj_original TEXT;

-- Criar índice para busca por CNPJ
CREATE INDEX IF NOT EXISTS idx_normalizacoes_estabelecimentos_cnpj 
ON normalizacoes_estabelecimentos(cnpj_original) 
WHERE cnpj_original IS NOT NULL AND ativo = true;

-- Atualizar função de normalização para considerar CNPJ
CREATE OR REPLACE FUNCTION public.normalizar_nome_estabelecimento(nome_input text, cnpj_input text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    nome_resultado TEXT;
    normalizacao_record RECORD;
BEGIN
    -- Se nome e CNPJ são null ou vazios, retornar vazio
    IF (nome_input IS NULL OR TRIM(nome_input) = '') AND (cnpj_input IS NULL OR TRIM(cnpj_input) = '') THEN
        RETURN '';
    END IF;
    
    -- Começar com o nome em maiúsculas e limpo
    nome_resultado := UPPER(TRIM(COALESCE(nome_input, '')));
    
    -- PRIORIDADE 1: Buscar por CNPJ (mais confiável)
    IF cnpj_input IS NOT NULL AND TRIM(cnpj_input) != '' THEN
        -- Normalizar CNPJ (remover caracteres especiais)
        DECLARE
            cnpj_normalizado TEXT;
        BEGIN
            cnpj_normalizado := regexp_replace(cnpj_input, '[^\d]', '', 'g');
            
            -- Buscar normalização exata por CNPJ
            SELECT ne.nome_normalizado INTO nome_resultado
            FROM normalizacoes_estabelecimentos ne
            WHERE ne.ativo = true
            AND ne.cnpj_original IS NOT NULL
            AND regexp_replace(ne.cnpj_original, '[^\d]', '', 'g') = cnpj_normalizado
            LIMIT 1;
            
            -- Se encontrou por CNPJ, retornar imediatamente
            IF FOUND THEN
                RETURN nome_resultado;
            END IF;
        END;
    END IF;
    
    -- PRIORIDADE 2: Buscar por nome (fallback)
    FOR normalizacao_record IN 
        SELECT ne.nome_original, ne.nome_normalizado
        FROM normalizacoes_estabelecimentos ne
        WHERE ne.ativo = true
        AND ne.nome_original IS NOT NULL
        ORDER BY LENGTH(ne.nome_original) DESC -- Processar nomes mais longos primeiro
    LOOP
        -- Verificar se o nome contém o padrão original
        IF nome_resultado LIKE '%' || UPPER(normalizacao_record.nome_original) || '%' 
           OR nome_resultado LIKE UPPER(normalizacao_record.nome_original) || '%' THEN
            nome_resultado := normalizacao_record.nome_normalizado;
            EXIT; -- Parar no primeiro match
        END IF;
    END LOOP;
    
    RETURN nome_resultado;
END;
$function$;

COMMENT ON FUNCTION public.normalizar_nome_estabelecimento(text, text) IS 'Normaliza nome de estabelecimento, priorizando busca por CNPJ quando disponível';