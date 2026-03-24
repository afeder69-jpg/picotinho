

## Diagnóstico: preço visível na consulta, mas invisível na lista para outro usuário

### Causa raiz

No `comparar-precos-lista/index.ts`, a função `buscarPrecoInteligente` tem um comportamento diferente dependendo de **como** o produto foi adicionado à lista:

**Usuário A** (lançou a nota) — provavelmente adicionou o item à lista manualmente (sem `produto_id`). O sistema:
1. Resolve o `produto_master_id` por nome (linha 310-337) → marca `masterResolvidoPorNome = true`
2. Busca por `produto_master_id + CNPJ` → se falhar, faz fallback por nome exato (linha 175-187)
3. Encontra o preço via nome → funciona

**Usuário B** (você) — adicionou via Consulta de Preços, que grava `produto_id` (master ID). O sistema:
1. Usa `item.produto_id` diretamente → `masterResolvidoPorNome = false`
2. Busca por `produto_master_id + CNPJ` na `precos_atuais` → se o registro de preço **não tem** `produto_master_id` preenchido → nada encontrado
3. Linha 168-170: como `masterResolvidoPorNome = false`, **pula o fallback por nome** e retorna `null` imediatamente

O problema está na linha 168-170:
```typescript
if (!masterResolvidoPorNome) {
  console.log(`  ❌ [MASTER-ID] Sem preço neste mercado — vínculo original, sem fallback`);
  return null;  // ← AQUI: bloqueia o fallback por nome
}
```

Essa lógica foi criada para "manter integridade" quando o vínculo é real, mas é excessivamente restritiva. Se `precos_atuais` não tem `produto_master_id` preenchido (comum em notas antigas), o preço existe mas é inacessível.

### Correção

**1 arquivo**: `supabase/functions/comparar-precos-lista/index.ts`

Quando a busca por `produto_master_id + CNPJ` falha, sempre tentar o fallback por **nome exato** no mesmo CNPJ antes de desistir — independentemente de `masterResolvidoPorNome`. O match exato por nome + CNPJ é seguro e conservador.

```typescript
// Linha 168-190 — substituir por:
// Fallback conservador: busca EXATA por nome no mesmo CNPJ
const { data: precoNomeExato } = await supabaseAdmin
  .from('precos_atuais')
  .select('valor_unitario, produto_nome, data_atualizacao')
  .eq('estabelecimento_cnpj', cnpjMercado)
  .ilike('produto_nome', produtoNome.trim())
  .order('data_atualizacao', { ascending: false })
  .limit(1)
  .maybeSingle();

if (precoNomeExato?.valor_unitario) {
  return { valor: precoNomeExato.valor_unitario, data_atualizacao: precoNomeExato.data_atualizacao };
}

// Se veio de vínculo original (não resolvido por nome), parar aqui
if (!masterResolvidoPorNome) {
  return null;
}
```

A mudança: o fallback por nome exato acontece **antes** da decisão de parar. Só se o nome exato também falhar, aí sim respeita a regra de integridade para vínculos originais.

### Resultado esperado

- Produto adicionado via Consulta de Preços agora encontra preço mesmo se `precos_atuais` não tem `produto_master_id` preenchido
- Consulta de Preços e Lista de Compras passam a ter comportamento consistente entre usuários
- Nenhum match fuzzy arriscado — apenas nome exato no mesmo CNPJ

