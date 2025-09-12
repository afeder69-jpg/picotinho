-- Backfill coordenadas para Torre & Cia Supermercados S.A.
DO $$
DECLARE
    torre_record RECORD;
    carrefour_record RECORD;
    endereco_completo TEXT;
BEGIN
    -- Buscar dados do Torre & Cia
    SELECT * INTO torre_record 
    FROM supermercados 
    WHERE cnpj = '07760885001814' 
    AND (latitude IS NULL OR longitude IS NULL);
    
    IF FOUND THEN
        -- Construir endereço completo
        endereco_completo := COALESCE(torre_record.endereco, '') || ', ' || 
                            COALESCE(torre_record.cidade, '') || ', ' || 
                            COALESCE(torre_record.estado, '') || ', ' || 
                            COALESCE(torre_record.cep, '') || ', Brasil';
        
        -- Limpar vírgulas duplas
        endereco_completo := REGEXP_REPLACE(endereco_completo, ',\s*,', ',', 'g');
        endereco_completo := REGEXP_REPLACE(endereco_completo, '^,\s*|,\s*$', '', 'g');
        
        RAISE NOTICE 'Geocodificando Torre & Cia: %', endereco_completo;
        
        -- Chamar função de geocodificação via HTTP
        PERFORM net.http_post(
            url := 'https://mjsbwrtegorjxcepvrik.supabase.co/functions/v1/geocodificar-endereco',
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'Authorization', 'Bearer ' || current_setting('request.jwt.claims', true)::json->>'role'
            ),
            body := jsonb_build_object(
                'supermercadoId', torre_record.id,
                'endereco', torre_record.endereco,
                'cidade', torre_record.cidade,
                'estado', torre_record.estado,
                'cep', torre_record.cep
            )
        );
    END IF;
    
    -- Buscar dados do Carrefour
    SELECT * INTO carrefour_record 
    FROM supermercados 
    WHERE cnpj = '45543915025176' 
    AND (latitude IS NULL OR longitude IS NULL);
    
    IF FOUND THEN
        -- Construir endereço completo
        endereco_completo := COALESCE(carrefour_record.endereco, '') || ', ' || 
                            COALESCE(carrefour_record.cidade, '') || ', ' || 
                            COALESCE(carrefour_record.estado, '') || ', ' || 
                            COALESCE(carrefour_record.cep, '') || ', Brasil';
        
        -- Limpar vírgulas duplas
        endereco_completo := REGEXP_REPLACE(endereco_completo, ',\s*,', ',', 'g');
        endereco_completo := REGEXP_REPLACE(endereco_completo, '^,\s*|,\s*$', '', 'g');
        
        RAISE NOTICE 'Geocodificando Carrefour: %', endereco_completo;
        
        -- Chamar função de geocodificação via HTTP
        PERFORM net.http_post(
            url := 'https://mjsbwrtegorjxcepvrik.supabase.co/functions/v1/geocodificar-endereco',
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'Authorization', 'Bearer ' || current_setting('request.jwt.claims', true)::json->>'role'
            ),
            body := jsonb_build_object(
                'supermercadoId', carrefour_record.id,
                'endereco', carrefour_record.endereco,
                'cidade', carrefour_record.cidade,
                'estado', carrefour_record.estado,
                'cep', carrefour_record.cep
            )
        );
    END IF;
    
    RAISE NOTICE 'Backfill de coordenadas executado para Torre & Cia e Carrefour';
END $$;