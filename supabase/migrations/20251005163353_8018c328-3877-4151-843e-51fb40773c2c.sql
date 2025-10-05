-- ETAPA 1: Reclassificar candidatos que foram auto-aprovados pela IA
-- Isso corrige os 80 registros que foram marcados como 'aprovado' pela IA
-- mas que na verdade deveriam ser 'auto_aprovado'

UPDATE produtos_candidatos_normalizacao
SET status = 'auto_aprovado'
WHERE status = 'aprovado' 
  AND revisado_por IS NULL
  AND confianca_ia >= 90;

-- Adicionar comentário explicativo no log
COMMENT ON COLUMN produtos_candidatos_normalizacao.status IS 
'Status do candidato: 
- auto_aprovado: IA decidiu com confiança >= 90%
- aprovado: Revisor humano aprovou manualmente
- pendente: Aguardando revisão (confiança < 90%)
- rejeitado: Revisor humano rejeitou';