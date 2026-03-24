

## Problema

A flag `item_livre` existe no frontend (`CriarListaDialog`) mas **nunca é salva no banco**. A tabela `listas_compras_itens` não tem essa coluna. O filtro em `ListaCompras.tsx` usa `!item.produto_id` para detectar itens livres, mas isso captura também produtos do catálogo que ficaram com `produto_id: null` (bug anterior). Resultado: todos os itens aparecem como "Itens livres".

## Correção

### 1. Migração: adicionar coluna `item_livre` na tabela

```sql
ALTER TABLE listas_compras_itens 
  ADD COLUMN item_livre boolean NOT NULL DEFAULT false;
```

Coluna booleana, default `false`. Itens existentes ficam como `false` (correto — são do catálogo).

### 2. Edge function `gerar-lista-otimizada` — propagar `item_livre`

Receber e salvar o campo `item_livre` vindo do frontend:

```typescript
// No mapeamento de itens para insert:
item_livre: p.item_livre || false
```

### 3. `CriarListaDialog.tsx` — enviar `item_livre` no body

Incluir `item_livre` no array `produtosManuais` enviado à edge function (linha 87-92).

### 4. `EditarListaDialog.tsx` — salvar `item_livre: true` ao inserir item livre

Ao inserir diretamente via `supabase.from('listas_compras_itens').insert(...)`, incluir `item_livre: true`.

### 5. `ListaCompras.tsx` — filtrar por `item_livre` em vez de `!produto_id`

```typescript
// ANTES:
const itensLivres = todosItens.filter((item: any) => !item.produto_id);

// DEPOIS:
const itensLivres = todosItens.filter((item: any) => item.item_livre === true);
```

Isso resolve o problema: produtos do catálogo com `produto_id: null` (bug antigo) continuam como "Produtos sem preço" e não mais como "Itens livres". Apenas itens explicitamente marcados como livres aparecem na seção de lembretes.

### 6. Atualizar types.ts

Adicionar `item_livre: boolean` nas interfaces Row/Insert/Update de `listas_compras_itens`.

### Arquivos alterados

- Nova migração SQL (coluna `item_livre`)
- `supabase/functions/gerar-lista-otimizada/index.ts`
- `src/components/listaCompras/CriarListaDialog.tsx`
- `src/components/listaCompras/EditarListaDialog.tsx`
- `src/pages/ListaCompras.tsx`
- `src/integrations/supabase/types.ts`

