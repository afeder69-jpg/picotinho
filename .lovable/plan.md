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
