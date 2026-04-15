---
name: Unicidade Global da Chave de Acesso
description: Chave de 44 dígitos é única globalmente entre notas ativas. Exclusão libera a chave. Verificação antecipada em process-url-nota antes do InfoSimples.
type: feature
---
A chave de acesso (44 dígitos) da nota fiscal é única globalmente no Picotinho.

## Regra de negócio
- Nota ativa = chave bloqueada globalmente (nenhum usuário pode lançar a mesma chave)
- Nota excluída (`excluida = true`) = chave liberada (pode ser relançada por qualquer usuário)
- Exclusão remove: itens do estoque + bloqueio da chave + futuramente pontuação

## Implementação (3 camadas)
1. **Banco**: coluna `chave_acesso` TEXT em `notas_imagens` + índice único parcial `WHERE chave_acesso IS NOT NULL AND excluida IS NOT TRUE`
2. **Backend**: `process-url-nota` faz SELECT rápido antes do INSERT. Retorna HTTP 409 com `error: 'NOTA_DUPLICADA'` se existir. Também trata race condition no INSERT (código 23505).
3. **Frontend**: `BottomNavigation.tsx` detecta 409/NOTA_DUPLICADA → toast destrutivo "Essa nota fiscal já foi lançada no Picotinho" → markError na fila → não entra no processamento pesado.

## Caso familiar
Usuário A lança → chave bloqueada. Usuário A exclui → chave liberada. Usuário B lança mesma nota → OK.
