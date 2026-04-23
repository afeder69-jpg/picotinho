

## Remover botão "Voltar" duplicado

### Problema
A tela tem dois botões de voltar: a setinha do `PageHeader` (topo) e um botão "← Voltar" logo abaixo, redundante.

### Solução
Em `src/pages/admin/NormalizacoesEstabelecimentos.tsx` (linhas 520-530):
- Remover o `<Button>` "Voltar" e ajustar o container para alinhar os botões de ação à direita.
- Simplificar o wrapper: trocar `flex flex-col sm:flex-row ... justify-between` por `flex justify-end`, mantendo o grupo de botões (Limpar Duplicatas, Aplicar a Notas Antigas, Nova Normalização) com o mesmo comportamento responsivo (`flex-wrap`).

### Garantias
- Apenas remoção visual; nenhuma lógica alterada.
- Navegação de volta continua disponível pela setinha do `PageHeader`.
- Demais botões e fluxos permanecem intactos.

