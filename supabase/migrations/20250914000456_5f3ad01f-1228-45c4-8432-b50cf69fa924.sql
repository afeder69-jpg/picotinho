-- Corrigir nome do produto SABÃO EM PÓ SURF para coincidir com a base de preços
UPDATE estoque_app 
SET produto_nome = 'SABÃO EM PÓ SURF EXPLOSÃO DE FLORES'
WHERE produto_nome = 'SABÃO EM PÓ SURF EXPLO.DE FLORES';

-- Corrigir outras abreviações similares que podem causar problemas
UPDATE estoque_app 
SET produto_nome = REPLACE(produto_nome, 'EXPLO.DE', 'EXPLOSÃO DE')
WHERE produto_nome LIKE '%EXPLO.DE%';