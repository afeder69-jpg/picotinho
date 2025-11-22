
-- Sincronizar estoque dos 3 produtos aprovados com seus produtos master
-- Isso corrigirá os contadores de "pendentes" no dashboard

-- CREME DE LEITE S/LAC.ITALAC 200G UHT
UPDATE estoque_app 
SET produto_master_id = '46749340-d6d7-4b42-b3cc-887416b33644',
    produto_candidato_id = NULL
WHERE id = 'ab0aa877-0b07-4b65-a1f4-247d8ef762df';

-- MANTEIGA C/SAL KREMINAS 500G
UPDATE estoque_app 
SET produto_master_id = '2d699046-56fc-4de7-a4e2-27f5400b1af8',
    produto_candidato_id = NULL
WHERE id = '976c1861-b6da-419b-875f-97552a77a83e';

-- GELATINA ROYAL 25G FAMBROESA
UPDATE estoque_app 
SET produto_master_id = '5376ad42-e335-42e2-abd1-037359099844',
    produto_candidato_id = NULL
WHERE id = '97cd0255-1973-46ff-a41a-ecaff54e4987';
