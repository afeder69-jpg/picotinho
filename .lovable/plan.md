

## Correção: contadores `total_usuarios` e `total_notas` sempre zerados/incorretos no Catálogo Master

### Causa raiz

Existem **dois caminhos** para criar/atualizar produtos master, e eles são inconsistentes:

1. **Função SQL `upsert_produto_master`** (migration `20251004203544`) — faz `total_usuarios = COALESCE(total_usuarios, 0) + 1` no UPDATE. Correto.

2. **Edge Function `processar-normalizacao-global`** (linha 1295-1296, 1310) — usa `.upsert()` do Supabase JS com valores fixos `total_usuarios: 1, total_notas: 1`. No conflito (upsert), esses valores **sobrescrevem** os contadores existentes, resetando-os para 1 em vez de incrementar.

O produto "FARINHA DE MILHO FLOCÃO MARATÁ 500G" provavelmente foi criado ou atualizado pela Edge Function, que fixou os contadores em 1 (ou 0 se houve algum outro fluxo de criação que não inicializou esses campos).

### Correção proposta

**1 arquivo**: `supabase/functions/processar-normalizacao-global/index.ts`

Substituir o `.upsert()` direto por lógica de INSERT/UPDATE separada que incremente os contadores corretamente:

- **INSERT** (produto novo): `total_usuarios: 1, total_notas: 1` — correto como está
- **UPDATE** (produto existente): usar `.update()` com incremento via SQL raw ou fazer um select antes e somar

A abordagem mais simples e segura: usar a função SQL `upsert_produto_master` que já existe e já faz o incremento correto, em vez de chamar `.upsert()` direto.

```typescript
// Substituir o .upsert() direto (linhas ~1308-1315) por:
const { data, error } = await supabase.rpc('upsert_produto_master', {
  p_sku_global: normalizacao.sku_global,
  p_nome_padrao: normalizacao.nome_padrao,
  p_nome_base: normalizacao.nome_base,
  p_categoria: normalizacao.categoria,
  p_qtd_valor: normalizacao.qtd_valor,
  p_qtd_unidade: normalizacao.qtd_unidade,
  p_qtd_base: normalizacao.qtd_base,
  p_unidade_base: normalizacao.unidade_base,
  p_categoria_unidade: normalizacao.categoria_unidade,
  p_granel: normalizacao.granel,
  p_marca: normalizacao.marca,
  p_tipo_embalagem: normalizacao.tipo_embalagem,
  p_imagem_url: normalizacao.imagem_url || null,
  p_imagem_path: normalizacao.imagem_path || null,
  p_confianca: normalizacao.confianca
});
```

Porém a função SQL `upsert_produto_master` não suporta `codigo_barras` nem retorna o `id`. Então precisamos:

**2 arquivo**: Nova migration SQL para atualizar `upsert_produto_master`:
- Adicionar parâmetro `p_codigo_barras TEXT DEFAULT NULL`
- Retornar o `id` do registro no JSONB de retorno
- Manter a lógica de incremento `+1`

**3 (opcional)**: Migration SQL para recalcular os contadores existentes com base nos dados reais:
```sql
UPDATE produtos_master_global pmg SET
  total_notas = (SELECT COUNT(*) FROM estoque_app WHERE produto_master_id = pmg.id),
  total_usuarios = (SELECT COUNT(DISTINCT user_id) FROM estoque_app WHERE produto_master_id = pmg.id);
```

### Arquivos a alterar

1. `supabase/functions/processar-normalizacao-global/index.ts` — usar RPC em vez de `.upsert()` direto
2. Nova migration SQL — atualizar função `upsert_produto_master` (adicionar `codigo_barras`, retornar `id`)
3. Nova migration SQL — recalcular contadores existentes com dados reais do `estoque_app`

### Resultado esperado

- Contadores incrementam corretamente a cada nota processada
- Produtos existentes têm contadores recalculados com valores reais
- Catálogo Master exibe números corretos de usuários e notas

