

## Correção do Layout dos Botões no Mobile

### Problema
Os botões no header da tela "Normalizações de Estabelecimentos" estão saindo da tela no mobile porque estão em uma única linha horizontal sem quebra.

### Solução
Ajustar o container dos botões para ser responsivo:

1. **Mudar o container principal** de `flex items-center justify-between gap-4` para `flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4` — isso empilha os elementos verticalmente no mobile e os coloca lado a lado no desktop.

2. **Mudar o container dos botões** de `flex gap-2` para `flex flex-wrap gap-2 w-full sm:w-auto justify-start sm:justify-end` — permite que os botões quebrem linha no mobile e fiquem alinhados à direita no desktop.

3. **Adicionar `size="sm"`** em todos os botões para reduzir o tamanho no mobile.

4. **Adicionar labels responsivas**:
   - Desktop: textos completos ("Limpar Duplicatas", "Aplicar a Notas Antigas", "Nova Normalização")
   - Mobile: textos curtos ("Limpar", "Aplicar", "Novo") para economizar espaço

### Arquivo a ser modificado
- `src/pages/admin/NormalizacoesEstabelecimentos.tsx` (linhas 519-560 aproximadamente)

### Garantias
- Nenhuma funcionalidade alterada, apenas layout responsivo
- Botões continuam funcionando exatamente como antes
- Visual otimizado para telas pequenas sem quebra de layout

