-- Atualizar coordenadas para o usuário atual baseado no CEP
UPDATE public.profiles 
SET latitude = -22.8972109, longitude = -43.5726989
WHERE user_id = 'ae5b5501-7f8a-46da-9cba-b9955a84e697' AND cep = '23050-101';