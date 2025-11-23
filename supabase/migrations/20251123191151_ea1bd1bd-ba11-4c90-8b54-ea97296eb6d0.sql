-- PARTE 1: Correção imediata dos 3 candidatos pendentes
-- Vincular manualmente aos masters existentes para sincronização automática via trigger

UPDATE produtos_candidatos_normalizacao SET
  sugestao_produto_master = 'e3c257b3-bed2-46ad-bd07-9138ba4efe55',
  status = 'auto_aprovado',
  confianca_ia = 100,
  razao_ia = 'Vinculação manual via correção de bug - produto idêntico já existia no banco'
WHERE id = '342a519c-c057-4a3e-8d66-02d33a35a36a'; -- CREME DE LEITE S/LAC.ITALAC 200G UHT

UPDATE produtos_candidatos_normalizacao SET
  sugestao_produto_master = 'a0a9ac60-d610-4542-b9a8-29ade6b12c19',
  status = 'auto_aprovado',
  confianca_ia = 100,
  razao_ia = 'Vinculação manual via correção de bug - produto idêntico já existia no banco'
WHERE id = '25f7f515-3a1d-46a6-af0b-389ba76add9e'; -- MANTEIGA C/SAL KREMINAS 500G

-- Buscar e atualizar o terceiro candidato (GELATINA ROYAL FRAMBOESA 25G)
UPDATE produtos_candidatos_normalizacao SET
  sugestao_produto_master = (
    SELECT id FROM produtos_master_global 
    WHERE nome_base = 'GELATINA FRAMBOESA' 
      AND marca = 'ROYAL' 
      AND qtd_base = 25 
      AND qtd_unidade = 'g'
    LIMIT 1
  ),
  status = 'auto_aprovado',
  confianca_ia = 100,
  razao_ia = 'Vinculação manual via correção de bug - produto idêntico já existia no banco'
WHERE texto_original ILIKE '%GELATINA ROYAL%FRAMBOESA%25%'
  AND status = 'pendente'
  AND sugestao_produto_master IS NULL;