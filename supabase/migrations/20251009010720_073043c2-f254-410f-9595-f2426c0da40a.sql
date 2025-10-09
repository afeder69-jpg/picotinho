-- FASE 1: LIMPAR BANCO - Deletar receitas vazias importadas incorretamente
DELETE FROM receitas_publicas_brasileiras 
WHERE fonte = 'afrodite-json'
AND (titulo = 'Sem título' OR titulo IS NULL OR titulo = '');

-- Log da limpeza
DO $$
BEGIN
  RAISE NOTICE 'Receitas vazias deletadas. Pronto para nova importação com mapeamento correto.';
END $$;