
-- Limpar registros órfãos (usuario deletado) usando NOT EXISTS
UPDATE public.whatsapp_telefones_autorizados
SET ativo = false
WHERE NOT EXISTS (
  SELECT 1 FROM auth.users u WHERE u.id = whatsapp_telefones_autorizados.usuario_id
);

-- Limpar pendentes abandonados (não verificados há mais de 30 minutos)
UPDATE public.whatsapp_telefones_autorizados
SET ativo = false
WHERE verificado = false
  AND ativo = true
  AND data_codigo < now() - interval '30 minutes';

-- Índice único parcial: apenas registros ativos
-- Seguro para retry: CREATE INDEX IF NOT EXISTS
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_numero_whatsapp_ativo
ON public.whatsapp_telefones_autorizados (numero_whatsapp)
WHERE ativo = true;
