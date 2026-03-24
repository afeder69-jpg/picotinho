

## Correção: itens livres sendo incluídos na comparação de preços

### Problema

A edge function `comparar-precos-lista` itera sobre **todos** os itens da lista (linha 297) e tenta buscar preços para cada um. Itens livres como "gelatina de tijolo" entram no fallback fuzzy (linha 196), que extrai palavras-chave ("GELATINA", "TIJOLO") e busca por OR em `precos_atuais`. Como existem gelatinas reais no banco, o sistema encontra preços e os atribui ao item livre — inventando preços que não existem.

### Correção

**1 arquivo**: `supabase/functions/comparar-precos-lista/index.ts`

Na linha 297, antes de processar cada item, verificar `item.item_livre === true`. Se for item livre, pular a busca de preços e enviar direto para `produtosSemPreco`.

```typescript
const precosPromises = itens.map(async (item) => {
  // Itens livres não participam da comparação de preços
  if (item.item_livre === true) {
    console.log(`⏭️ Item livre ignorado na comparação: ${item.produto_nome}`);
    return { item, precos: new Map() };
  }
  // ... resto da lógica existente
```

Isso garante que itens livres nunca passem pela busca fuzzy e nunca recebam preços inventados. Eles continuam aparecendo na seção "Lembretes / Itens livres" no frontend normalmente.

