## Sincronização centralizada Master → Estoque (IMPLEMENTADO)

### Problema resolvido
Alterações em `produtos_master_global` (nome, categoria, EAN, SKU, imagem, marca, etc.) não eram propagadas para `estoque_app`, deixando o estoque dos usuários inconsistente.

### Solução implementada

1. **Função centralizada `sync_estoque_from_master(p_master_id)`** — atualiza todos os `estoque_app` vinculados a um master, com mapeamento de categoria para o domínio válido do estoque.

2. **Trigger `trg_sync_master_to_estoque`** — dispara automaticamente `AFTER UPDATE` em `produtos_master_global` quando qualquer campo relevante muda.

3. **Edge Function `consolidar-masters-manual`** — agora chama `sync_estoque_from_master` via RPC após consolidar duplicatas.

4. **Backfill** — corrigiu 175 registros divergentes (nomes, categorias, EANs).

### Campos sincronizados (master → estoque)
`produto_nome`, `produto_nome_normalizado`, `categoria`, `ean_comercial`, `sku_global`, `nome_base`, `marca`, `imagem_url`, `tipo_embalagem`, `qtd_valor`, `qtd_unidade`, `qtd_base`, `unidade_base`, `granel`

### Campos do usuário preservados
`user_id`, `quantidade`, `preco_unitario_ultimo`, `preco_por_unidade_base`, `nota_id`, `compra_id`, `origem`, `created_at`, `unidade_medida`

---

## Vínculo estrutural precos_atuais → Master (IMPLEMENTADO)

### Problema resolvido
A Consulta de Preços não encontrava preços para muitos produtos porque `precos_atuais.produto_nome` contém o nome original da nota fiscal (ex: `ACUCAR DEMER 1KG UN`) enquanto o catálogo master usa nomes padronizados (ex: `AÇÚCAR DEMERARA UNIÃO 1KG`). O matching por string falhava na maioria dos casos.

### Solução implementada

1. **Coluna `produto_master_id`** adicionada em `precos_atuais` com FK para `produtos_master_global` e índice.

2. **Backfill conservador** — 209 de 425 registros vinculados via:
   - Match exato por `produtos_candidatos_normalizacao.texto_original` (aprovados)
   - Match exato por `estoque_app.produto_nome` onde `produto_master_id` já existia

3. **Edge Function `update-precos-atuais`** — agora resolve `produto_master_id` ao gravar preços (via `estoque_app` ou `candidatos`).

4. **Edge Function `consultar-precos-produto`** — busca primária por `produto_master_id` (direto, sem nome); fallback por nome apenas quando não há vínculo.

### Resultado
- Consulta por ID estrutural: 49% dos preços (tendência crescente com novas notas)
- Fallback por nome: 51% restante (casos sem candidato aprovado)
- Sem associações arriscadas: apenas matches exatos no backfill
