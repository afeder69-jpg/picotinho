

## Entendimento

O badge amarelo no botão "Buscar e Consolidar Duplicatas" exibe um número que não corresponde ao resultado real da análise. A solução é remover o badge e a lógica de contagem associada, mantendo o botão e sua funcionalidade intactos.

## Alterações em `src/pages/admin/NormalizacaoGlobal.tsx`

1. **Remover o estado `duplicatasEncontradas`** (linha 188) e todas as suas referências:
   - Remover `useState` na linha 188
   - Remover a função `buscarDuplicatas` que chama `contar-duplicatas-master` (~linhas 615-622)
   - Remover o `useEffect` que chama `buscarDuplicatas` ao carregar a tela
   - Remover o `setDuplicatasEncontradas` na linha 714 (após consolidação)
   - Remover o bloco do Badge nas linhas 1944-1951

2. **Resultado**: o botão fica apenas com o texto "Buscar e Consolidar Duplicatas", sem contador.

Nenhum outro arquivo é alterado. A Edge Function `contar-duplicatas-master` pode ser mantida para uso futuro ou removida — sem impacto.

