-- ============================================================================
-- CONSOLIDAÇÃO DE MASTERS DUPLICADOS: CREME DE LEITE ITALAC 200G
-- ============================================================================
-- Problema: 4 masters para o mesmo produto em categorias diferentes
-- Solução: Consolidar em um único master correto (MERCEARIA)
-- ============================================================================

DO $$
DECLARE
  master_correto_id UUID := '7e907304-5a72-499f-97aa-b95f36a0d3f1'; -- MERCEARIA
  master_alimentos_1 UUID := '46749340-d6d7-4b42-b3cc-887416b33644'; -- ALIMENTOS (SEM LACTOSE)
  master_alimentos_2 UUID := '0c70db95-735e-49d2-9a94-938458a348c0'; -- ALIMENTOS
  master_laticinios UUID := 'e3c257b3-bed2-46ad-bd07-9138ba4efe55'; -- LATICÍNIOS/FRIOS
BEGIN
  RAISE NOTICE '🔄 Iniciando consolidação de masters duplicados...';
  
  -- 2️⃣ Atualizar master correto com dados consolidados
  UPDATE produtos_master_global
  SET
    nome_padrao = 'CREME DE LEITE ITALAC 200G',
    nome_base = 'CREME DE LEITE 200G',
    marca = 'ITALAC',
    categoria = 'MERCEARIA',
    qtd_base = 200,
    qtd_unidade = 'UN',
    qtd_valor = 1,
    sku_global = 'MERCEARIA-CREME_DE_LEITE-ITALAC-200G',
    total_notas = (
      SELECT COALESCE(SUM(total_notas), 0) 
      FROM produtos_master_global 
      WHERE id IN (master_correto_id, master_alimentos_1, master_alimentos_2, master_laticinios)
    ),
    total_usuarios = (
      SELECT COALESCE(SUM(total_usuarios), 0) 
      FROM produtos_master_global 
      WHERE id IN (master_correto_id, master_alimentos_1, master_alimentos_2, master_laticinios)
    ),
    updated_at = NOW()
  WHERE id = master_correto_id;
  
  RAISE NOTICE '✅ Master correto atualizado: %', master_correto_id;
  
  -- 3️⃣ Migrar referências do estoque_app para o master correto
  UPDATE estoque_app
  SET 
    produto_master_id = master_correto_id,
    sku_global = 'MERCEARIA-CREME_DE_LEITE-ITALAC-200G',
    categoria = 'mercearia',
    updated_at = NOW()
  WHERE produto_master_id IN (master_alimentos_1, master_alimentos_2, master_laticinios);
  
  RAISE NOTICE '✅ Referências no estoque_app migradas';
  
  -- 4️⃣ Migrar referências dos candidatos de normalização
  UPDATE produtos_candidatos_normalizacao
  SET 
    sugestao_produto_master = master_correto_id,
    sugestao_sku_global = 'MERCEARIA-CREME_DE_LEITE-ITALAC-200G',
    categoria_sugerida = 'MERCEARIA',
    updated_at = NOW()
  WHERE sugestao_produto_master IN (master_alimentos_1, master_alimentos_2, master_laticinios);
  
  RAISE NOTICE '✅ Referências nos candidatos migradas';
  
  -- 5️⃣ Criar sinônimos para os masters duplicados (sem aprovado_por)
  INSERT INTO produtos_sinonimos_globais (produto_master_id, texto_variacao, fonte, confianca, aprovado_em)
  VALUES
    (master_correto_id, 'CREME DE LEITE UHT SEM LACTOSE ITALAC 200G', 'consolidacao_masters', 1.0, NOW()),
    (master_correto_id, 'CREME DE LEITE ITALAC 200G', 'consolidacao_masters', 1.0, NOW()),
    (master_correto_id, 'CREME DE LEITE S/ LAC. ITALAC 200G', 'consolidacao_masters', 1.0, NOW())
  ON CONFLICT DO NOTHING;
  
  RAISE NOTICE '✅ Sinônimos criados';
  
  -- 6️⃣ Deletar masters duplicados
  DELETE FROM produtos_master_global
  WHERE id IN (master_alimentos_1, master_alimentos_2, master_laticinios);
  
  RAISE NOTICE '✅ Masters duplicados deletados: 3 registros';
  RAISE NOTICE '🎉 Consolidação concluída com sucesso!';
END $$;