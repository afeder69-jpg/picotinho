-- ⚡ PARTE B: VINCULAR MANUALMENTE OS 3 PRODUTOS PROBLEMÁTICOS

-- 1️⃣ GELATINA ROYAL FRAMBOESA 25G
UPDATE produtos_candidatos_normalizacao SET
  sugestao_produto_master = '17a74414-6814-473a-bb3d-0865dc041029',
  status = 'auto_aprovado',
  confianca_ia = 100,
  razao_ia = 'Vinculado manualmente ao master existente (GELATINA ROYAL FRAMBOESA 25G) - correção de typo FAMBROESA'
WHERE id = '67f63fcf-f2dd-4376-81f3-ce3594ecd0c4';

-- 2️⃣ MANTEIGA C/ SAL KREMINAS 500G
UPDATE produtos_candidatos_normalizacao SET
  sugestao_produto_master = 'a0a9ac60-d610-4542-b9a8-29ade6b12c19',
  status = 'auto_aprovado',
  confianca_ia = 100,
  razao_ia = 'Vinculado manualmente ao master existente (MANTEIGA C/ SAL KREMINAS 500G) - correção de espaçamento'
WHERE id = '38a2a857-5e29-4b14-bb5a-02d5e8cbf703';

-- 3️⃣ CREME DE LEITE S/ LAC. ITALAC 200G
UPDATE produtos_candidatos_normalizacao SET
  sugestao_produto_master = 'e3c257b3-bed2-46ad-bd07-9138ba4efe55',
  status = 'auto_aprovado',
  confianca_ia = 100,
  razao_ia = 'Vinculado manualmente ao master existente (CREME DE LEITE S/ LAC. ITALAC 200G) - correção de pontuação'
WHERE id = '1eef9243-4db5-42c1-9e4b-34de077385aa';