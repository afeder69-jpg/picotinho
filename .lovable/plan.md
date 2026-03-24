
Objetivo: corrigir de forma definitiva o fluxo “Adicionar à lista” na Consulta de Preço, separando claramente as duas etapas (criação da lista e inserção do item) e eliminando o estado parcial (lista criada, porém vazia).

1) Diagnóstico cirúrgico (causa real)

- Etapa 1 (criação da lista): está funcionando.
  - Evidência: as listas novas aparecem no diálogo e na aba “Lista de Compras”.
  - Evidência técnica: já existem registros recentes em `listas_compras` com `itens = 0`.

- Etapa 2 (inserção do produto): está falhando.
  - Evidência de log:
    - `code: 23503`
    - `insert or update on table "listas_compras_itens" violates foreign key constraint "listas_compras_itens_produto_id_fkey"`
    - `Key is not present in table "estoque_app"`

- Causa raiz:
  - O fluxo de consulta usa `produto.id` vindo de `produtos_master_global` (edge `consultar-precos-produto`).
  - Mas `listas_compras_itens.produto_id` está com FK apontando para `estoque_app(id)`.
  - Resultado: qualquer tentativa de inserir esse `produto.id` em `listas_compras_itens` quebra por FK.
  - O frontend captura o erro da etapa 2 dentro do mesmo `try/catch` da etapa 1 e exibe “Erro ao criar lista”, mesmo com a lista já criada.

2) Correção proposta (simples, segura e funcional)

A. Ajuste estrutural no banco (principal)
- Corrigir a FK de `listas_compras_itens.produto_id` para o domínio correto:
  - remover FK atual para `estoque_app(id)`
  - criar FK para `produtos_master_global(id)` com `ON DELETE SET NULL`
- Isso alinha o schema com a lógica real já usada em:
  - Consulta de preços
  - comparação de lista (`comparar-precos-lista`, que trata `produto_id` como master id)

B. Ajuste de fluxo no frontend (`AdicionarListaDialog.tsx`)
- Separar o fluxo em duas etapas com tratamento independente:
  1. criar lista
  2. inserir produto na lista
- Mensagens específicas por etapa:
  - falha na etapa 1: “Erro ao criar lista”
  - falha na etapa 2: “Erro ao adicionar produto à lista”
- Evitar estado parcial:
  - se etapa 1 sucesso e etapa 2 falhar, executar rollback compensatório (deletar a lista recém-criada) para não deixar lista vazia “fantasma”.

C. Fortalecimento de payload e observabilidade
- Inserção explícita:
  - `produto_id: produto.id ?? null`
  - `item_livre: false`
  - `unidade_medida` com fallback seguro
- Log técnico com `error.code`, `error.message`, `lista_id`, `produto_id` para diagnóstico futuro sem ambiguidade.

3) Arquivos a alterar

- Nova migration SQL (schema):
  - alterar FK de `listas_compras_itens.produto_id` (de `estoque_app` para `produtos_master_global`)
- `src/components/consultaPrecos/AdicionarListaDialog.tsx`:
  - separar try/catch por etapa
  - rollback compensatório quando necessário
  - mensagens de erro por etapa

4) Validação pós-implementação (E2E)

- Cenário A: adicionar em lista existente
  - esperado: item entra sem erro
- Cenário B: criar nova lista + adicionar produto no mesmo fluxo
  - esperado: lista criada e já com item
- Cenário C: falha forçada na etapa 2
  - esperado: lista não fica criada vazia (rollback)
- Conferir:
  - item aparece em `listas_compras_itens`
  - lista abre com item
  - comparação de preços continua funcionando para o item adicionado

Se aprovado, implemento exatamente nesse formato (correção estrutural + correção de fluxo por etapa), atacando a causa raiz e eliminando o comportamento parcial.
