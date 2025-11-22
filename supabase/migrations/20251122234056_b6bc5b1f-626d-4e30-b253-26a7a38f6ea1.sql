-- Atualizar status dos 3 produtos órfãos para torná-los visíveis em "Pendentes"
UPDATE produtos_candidatos_normalizacao
SET status = 'pendente'
WHERE id IN (
  'b3388d83-dcbf-4c97-970d-a77a4ecdb5d5',  -- CREME DE LEITE S/LAC.ITALAC 200G UHT
  'de8eaee8-eabf-4cb5-a735-b01fcaac5f85',  -- MANTEIGA C/SAL KREMINAS 500G
  '34191b38-e6ed-4065-b578-d0c6783ec62e'   -- GELATINA ROYAL 25G FAMBROESA
);