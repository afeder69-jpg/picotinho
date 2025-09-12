-- Limpar somente a chave de acesso (44 dígitos) do registro residual do usuário
-- Isso permite reprocessar a mesma nota sem bloqueio por duplicidade

-- Alvo: notas_imagens.id = 706df40a-2557-4700-88da-308a57747ee5
-- Usuário: ae5b5501-7f8a-46da-9cba-b9955a84e697

UPDATE public.notas_imagens
SET 
  dados_extraidos = CASE
    WHEN dados_extraidos ? 'chave_acesso' THEN (dados_extraidos - 'chave_acesso')
    ELSE dados_extraidos
  END,
  updated_at = now()
WHERE id = '706df40a-2557-4700-88da-308a57747ee5'
  AND usuario_id = 'ae5b5501-7f8a-46da-9cba-b9955a84e697';
