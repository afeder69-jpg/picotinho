CREATE OR REPLACE FUNCTION public.normalizar_telefone_br()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Remove tudo que não é dígito
  NEW.numero_whatsapp := regexp_replace(NEW.numero_whatsapp, '[^0-9]', '', 'g');
  
  -- Se tem 11 dígitos (formato nacional), adiciona 55
  IF length(NEW.numero_whatsapp) = 11 THEN
    NEW.numero_whatsapp := '55' || NEW.numero_whatsapp;
  END IF;
  
  -- Validar resultado final: deve ter 13 dígitos começando com 55
  IF length(NEW.numero_whatsapp) != 13 OR NEW.numero_whatsapp NOT LIKE '55%' THEN
    RAISE EXCEPTION 'Número de telefone inválido: %. Esperado: 11 dígitos (DDD + número) ou 13 dígitos (55 + DDD + número)', NEW.numero_whatsapp;
  END IF;
  
  RETURN NEW;
END;
$$;