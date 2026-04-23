-- Reconciliação cirúrgica de contadores fantasma (Opção A)
-- Atua exclusivamente em 2 masters cuja ausência total de lastro foi confirmada
-- por SQL em estoque_app, precos_atuais, precos_atuais_usuario, historico_precos_app
-- e notas_imagens.dados_extraidos.itens.
--
-- Masters afetados (por ID, escopo restrito):
--   - c7592206-5383-461e-9cf4-31210fa3be1b  ESPONJA DE AÇO BOMBRIL 45G
--   - 568976d1-5b64-4bd4-8cef-644306090e64  ARROZ COPARROZ PARBOILIZADO T1 5KG
--
-- Mantém status='ativo'. Não toca em nenhum outro registro.
UPDATE public.produtos_master_global
SET total_notas = 0,
    total_usuarios = 0,
    updated_at = now()
WHERE id IN (
  'c7592206-5383-461e-9cf4-31210fa3be1b',
  '568976d1-5b64-4bd4-8cef-644306090e64'
);