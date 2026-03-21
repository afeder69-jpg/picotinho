

## Plano: Campo de busca no painel de duplicatas

### O que será feito

Adicionar um campo de texto de busca logo abaixo do cabeçalho do modal de duplicatas (linha ~2899), antes da lista de grupos. Conforme o usuário digita, os grupos são filtrados dinamicamente — mostrando apenas os que contêm pelo menos um produto cujo `nome_padrao`, `marca`, ou `sku_global` contenha o termo buscado.

### Detalhes técnicos

1. **Novo estado** `buscaDuplicatas` (string) no componente, inicializado como `""` e limpo ao fechar o modal.

2. **Campo de busca** com ícone de lupa, posicionado entre o `DialogDescription` e a lista de grupos (linha ~2901). Usa o componente `Input` já existente.

3. **Filtragem** — antes do `.map()` dos grupos (linha 2902), aplicar `.filter()`:
   - Para cada grupo, verificar se algum produto do grupo tem `nome_padrao`, `marca` ou `sku_global` que contenha o texto digitado (case-insensitive).
   - Se o termo estiver vazio, mostrar todos os grupos (comportamento atual).

4. **Contador atualizado** — o título do modal mostrará quantos grupos estão visíveis vs total (ex: "3 de 12 grupos").

### O que NÃO muda

- Lógica de detecção de duplicatas (edge function).
- Processo de consolidação (seleção de produto principal, "Manter Ambos", confirmar).
- Nenhum outro componente ou página.

