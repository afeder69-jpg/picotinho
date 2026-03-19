

## Plano: Remover botão de leitura do topo da página "Minhas Notas Fiscais"

### Contexto
O `BottomNavigation` já renderiza o botão central circular de leitura de nota em **todas** as páginas, incluindo `/screenshots`. Esse botão já dispara o scanner com as 3 opções. O botão retangular no topo da página é redundante.

### Alteração
**Arquivo: `src/pages/Screenshots.tsx`**
- Remover o bloco do botão "Ler Nota Fiscal" (linhas 53-59) que está no topo da página
- Remover imports não utilizados (`QrCode`)
- O botão circular do `BottomNavigation` já faz exatamente o mesmo papel, com o mesmo visual da página inicial

### Resultado
- A página fica limpa, mostrando apenas o header e a lista de notas agrupada
- O botão de leitura continua disponível no mesmo local e formato da home (circular, centralizado embaixo)
- Zero duplicação de código ou comportamento

