-- Executar correção de normalização para notas existentes
SELECT 
  supabase.functions.invoke(
    'corrigir-normalizacao-notas',
    '{}'::jsonb
  ) as resultado;