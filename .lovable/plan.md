

## Plano: Fallback conservador para itens sem produto_id

### O que muda

**Arquivo: `supabase/functions/picotinho-assistant/index.ts`** — bloco nas linhas 889-897

O código atual insere silenciosamente como `item_livre: true` quando não há `produto_id`. A correção replica a mesma lógica de re-resolução que já existe para IDs inválidos (linhas 833-886), mas aplicada ao caso "sem ID nenhum".

### Lógica do fallback conservador

Substituir o bloco das linhas 889-897 por:

```text
sem produto_id e sem item_livre →
  1. Buscar no catálogo via buscar_produtos_master_por_palavras (limite 5)
  2. Se exatamente 1 resultado → vincular automaticamente (item_livre=false)
  3. Se 2+ resultados → adicionar a itensPendentesDesambiguacao (perguntar ao usuário)
  4. Se 0 resultados → adicionar a itensPendentesConfirmacao (pedir confirmação antes de criar como livre)
```

Isso garante:
- Tomate com 1 match claro → vincula ao master automaticamente
- Tomate com múltiplas variantes (tomate italiano, tomate cereja, etc.) → pergunta ao usuário qual
- Produto totalmente desconhecido → pede confirmação antes de criar como livre
- **Nenhum item entra silenciosamente como avulso**

### Código concreto

```typescript
// Sem produto_id e sem item_livre — tentar resolver antes de desistir
console.log(`🔍 [fallback] "${item.produto_nome}" chegou sem produto_id. Tentando resolver no catálogo...`);
const palavrasFallback = item.produto_nome.split(/\s+/).filter((p: string) => p.length >= 2);

if (palavrasFallback.length > 0) {
  const { data: mastersFallback } = await supabase.rpc('buscar_produtos_master_por_palavras', {
    p_palavras: palavrasFallback, p_limite: 5
  });

  if (mastersFallback?.length === 1) {
    // 1 match claro — vincular automaticamente
    console.log(`✅ [fallback] "${item.produto_nome}" → match único: ${mastersFallback[0].nome_padrao} (${mastersFallback[0].id})`);
    itensParaInserir.push({
      lista_id: listaId,
      produto_nome: item.produto_nome,
      quantidade: item.quantidade || 1,
      unidade_medida: item.unidade_medida || 'UN',
      item_livre: false,
      produto_id: mastersFallback[0].id
    });
    continue;
  }

  if (mastersFallback && mastersFallback.length > 1) {
    // Múltiplas opções — perguntar ao usuário
    console.log(`⚠️ [fallback] "${item.produto_nome}" → ${mastersFallback.length} opções. Desambiguação necessária.`);
    itensPendentesDesambiguacao.push({
      produto_nome: item.produto_nome,
      quantidade: item.quantidade || 1,
      unidade_medida: item.unidade_medida || 'UN',
      origem_fluxo: 'fallback_sem_id',
      opcoes: mastersFallback.map((m: any) => ({
        produto_id: m.id,
        nome_padrao: m.nome_padrao,
        marca: m.marca,
        categoria: m.categoria
      }))
    });
    continue;
  }
}

// 0 resultados — pedir confirmação para item livre
console.log(`❓ [fallback] "${item.produto_nome}" → sem correspondência no catálogo. Aguardando confirmação.`);
itensPendentesConfirmacao.push({
  produto_nome: item.produto_nome,
  quantidade: item.quantidade || 1,
  unidade_medida: item.unidade_medida || 'UN',
  origem_fluxo: 'fallback_sem_id',
  motivo: `"${item.produto_nome}" não foi encontrado no catálogo. Deseja adicionar como item livre?`
});
```

### Escopo

- 1 arquivo: `supabase/functions/picotinho-assistant/index.ts`
- Deploy da Edge Function
- Nenhuma migration, nenhuma alteração no frontend

### Resultado esperado

- Itens genéricos com match único no catálogo → vinculados automaticamente
- Itens genéricos com múltiplas variantes → assistente pergunta qual
- Itens sem correspondência → assistente pede confirmação antes de criar como livre
- Zero inserções silenciosas como item avulso

