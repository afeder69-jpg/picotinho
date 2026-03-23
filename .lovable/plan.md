

## Correção: Garantir vínculo master em itens da lista de compras

### Causa raiz

Itens inseridos na lista de compras ficam sem `produto_id` (produto_master_id), forçando a comparação a usar busca fuzzy em vez da busca estrutural. A consulta individual usa sempre o master_id, por isso os resultados divergem.

### Correções

**1. `src/components/listaCompras/EditarListaDialog.tsx` — linha 109**

Trocar `produto_id: null` por `produto_id: produto.id || null`. O objeto `produto` já contém o ID master (vem da busca em `produtos_master_global`), basta usá-lo.

**2. `supabase/functions/comparar-precos-lista/index.ts` — resolver master_id antes da busca**

Antes de chamar `buscarPrecoInteligente`, quando `item.produto_id` é null, tentar resolver o master_id consultando `produtos_master_global` pelo nome do produto. Isso corrige itens existentes que já estão sem vínculo.

Adicionar bloco de resolução na seção de busca (antes da linha 286):

```typescript
// Resolver produto_master_id se o item não tem vínculo
let produtoMasterId = item.produto_id || null;
if (!produtoMasterId) {
  const { data: master } = await supabaseAdmin
    .from('produtos_master_global')
    .select('id')
    .ilike('nome_padrao', item.produto_nome.trim())
    .limit(1)
    .maybeSingle();
  if (master) produtoMasterId = master.id;
}
```

Depois usar `produtoMasterId` em vez de `item.produto_id` na chamada a `buscarPrecoInteligente`.

**3. `supabase/functions/gerar-lista-otimizada/index.ts` — salvar master_id ao criar lista**

Após montar o array `produtos`, antes de inserir, buscar o master_id para cada produto por nome e incluir `produto_id` no insert.

### O que NÃO muda

- `consultar-precos-produto` — sem alteração
- `buscar-supermercados-area` — sem alteração
- Lógica interna de `buscarPrecoInteligente` — preservada
- Interface da lista de compras — sem alteração
- Nenhuma outra edge function além das mencionadas

### Resultado esperado

- Itens da lista passam a ter vínculo com produto master (novos e existentes via resolução)
- A comparação usa busca estrutural (Passo 0) em vez de fuzzy
- Mesmos mercados e preços aparecem na consulta individual e na comparação

