

## Correção da comparação de preços — Ajustes 1 e 2

### Ajuste 1: Resolução de master priorizando o que tem preços reais

**Onde:** `comparar-precos-lista/index.ts`, linhas 282-294

**Atual:** Busca um único master por nome (`ilike + limit(1)`) sem critério de ordenação — pode pegar um duplicado sem preços.

**Novo:** Buscar até 5 masters com o mesmo nome, depois verificar qual deles tem registros em `precos_atuais`. Usar o primeiro que tiver preços vinculados. Se nenhum tiver, usar o primeiro como fallback (comportamento atual preservado).

```typescript
let produtoMasterId = item.produto_id || null;
let masterResolvidoPorNome = false;

if (!produtoMasterId) {
  const { data: masters } = await supabaseAdmin
    .from('produtos_master_global')
    .select('id')
    .ilike('nome_padrao', item.produto_nome.trim())
    .limit(5);

  if (masters && masters.length > 0) {
    // Preferir master que realmente tem preços
    for (const m of masters) {
      const { count } = await supabaseAdmin
        .from('precos_atuais')
        .select('id', { count: 'exact', head: true })
        .eq('produto_master_id', m.id)
        .limit(1);
      if (count && count > 0) {
        produtoMasterId = m.id;
        break;
      }
    }
    if (!produtoMasterId) produtoMasterId = masters[0].id;
    masterResolvidoPorNome = true;
  }
}
```

### Ajuste 2: Fallback conservador quando master resolvido por nome não encontra preço

**Onde:** `buscarPrecoInteligente`, linhas 151-170

**Atual:** Se `produtoMasterId + cnpjMercado` não encontra preço → `return null` (hard stop), mesmo quando o master foi resolvido por nome e pode estar errado (duplicado).

**Novo:** Diferenciar dois cenários:
- **Item com `produto_id` original** (veio da tabela): manter `return null` — integridade total
- **Master resolvido por nome** (sem vínculo original): permitir fallback para busca **exata por nome** no mesmo CNPJ — não fuzzy, não OR, apenas `ilike` exato do `produto_nome` em `precos_atuais` filtrado pelo CNPJ do mercado

O fallback **não usa** busca por palavras-chave, não usa OR, não faz aproximação. Apenas tenta encontrar o nome exato do produto na tabela de preços daquele mercado específico. Isso garante:
- Não associa preço de produto parecido mas diferente
- Não troca item por aproximação indevida
- Só encontra se o nome exato existir naquele mercado

```typescript
// Dentro de buscarPrecoInteligente, após a busca por master_id+cnpj falhar:
if (produtoMasterId && cnpjMercado) {
  const { data: precoMaster } = await supabaseAdmin
    .from('precos_atuais')
    .select('valor_unitario, produto_nome')
    .eq('produto_master_id', produtoMasterId)
    .eq('estabelecimento_cnpj', cnpjMercado)
    .order('data_atualizacao', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (precoMaster?.valor_unitario) {
    return precoMaster.valor_unitario;
  }

  // Se o master veio do produto_id original → manter integridade
  if (!masterResolvidoPorNome) {
    return null;
  }

  // Fallback conservador: busca exata por nome neste CNPJ
  const { data: precoNomeExato } = await supabaseAdmin
    .from('precos_atuais')
    .select('valor_unitario, produto_nome')
    .eq('estabelecimento_cnpj', cnpjMercado)
    .ilike('produto_nome', produtoNome.trim())
    .order('data_atualizacao', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (precoNomeExato?.valor_unitario) {
    return precoNomeExato.valor_unitario;
  }

  return null;
}
```

### Alterações

- 1 edge function: `comparar-precos-lista/index.ts`
- A flag `masterResolvidoPorNome` é passada para `buscarPrecoInteligente` como parâmetro adicional
- Zero alteração em tabelas, frontend ou outras funções
- Fallback restrito a match exato por nome + CNPJ — sem aproximação

