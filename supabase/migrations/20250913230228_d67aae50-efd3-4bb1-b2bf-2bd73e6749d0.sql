-- Corrigir função normalizar_nome_estabelecimento para resolver ambiguidade
CREATE OR REPLACE FUNCTION public.normalizar_nome_estabelecimento(nome_input text)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    nome_resultado TEXT;
    normalizacao_record RECORD;
BEGIN
    -- Se nome é null ou vazio, retornar vazio
    IF nome_input IS NULL OR TRIM(nome_input) = '' THEN
        RETURN '';
    END IF;
    
    -- Começar com o nome em maiúsculas e limpo
    nome_resultado := UPPER(TRIM(nome_input));
    
    -- Aplicar normalizações da tabela
    FOR normalizacao_record IN 
        SELECT ne.nome_original, ne.nome_normalizado as novo_nome
        FROM normalizacoes_estabelecimentos ne
        WHERE ne.ativo = true
        ORDER BY LENGTH(ne.nome_original) DESC -- Processar nomes mais longos primeiro
    LOOP
        -- Verificar se o nome contém o padrão original
        IF nome_resultado LIKE '%' || UPPER(normalizacao_record.nome_original) || '%' THEN
            nome_resultado := normalizacao_record.novo_nome;
            EXIT; -- Parar no primeiro match
        END IF;
    END LOOP;
    
    RETURN nome_resultado;
END;
$function$