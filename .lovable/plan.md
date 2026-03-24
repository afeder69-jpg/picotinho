

## Busca inteligente multi-campo na Consulta de Preços

### Abordagem

Criar uma RPC SQL que busca em `nome_padrao`, `nome_base` e `marca` simultaneamente, com suporte a múltiplas palavras, sem acentos e case-insensitive. A busca exige que **todas** as palavras digitadas apareçam em **pelo menos um** dos três campos concatenados.

### Alterações

**1. Migration SQL** — criar função `buscar_produtos_master_por_palavras`:

```sql
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE OR REPLACE FUNCTION buscar_produtos_master_por_palavras(p_palavras TEXT[])
RETURNS TABLE (...) AS $$
DECLARE
  v_query TEXT;
  v_palavra TEXT;
  v_search_field TEXT := 'unaccent(lower(COALESCE(nome_padrao,'''') || '' '' || COALESCE(nome_base,'''') || '' '' || COALESCE(marca,'''')))';
BEGIN
  v_query := 'SELECT id, nome_padrao, nome_base, marca, categoria, codigo_barras, imagem_url, sku_global, qtd_valor, qtd_unidade, unidade_base FROM produtos_master_global WHERE status = ''ativo''';
  
  FOREACH v_palavra IN ARRAY p_palavras LOOP
    v_query := v_query || ' AND ' || v_search_field || ' LIKE ''%'' || unaccent(lower(' || quote_literal(v_palavra) || ')) || ''%''';
  END LOOP;
  
  v_query := v_query || ' ORDER BY total_notas DESC NULLS LAST LIMIT 20';
  RETURN QUERY EXECUTE v_query;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
```

Concatenar os 3 campos garante que "marata flocao" encontra o produto mesmo que "maratá" esteja em `marca` e "flocão" em `nome_padrao`. Sem ruído extra — são campos estruturados do mesmo produto.

**2. Edge Function** — `supabase/functions/consultar-precos-produto/index.ts`

Substituir o bloco `tipo === 'nome'` (linhas 77-88) para normalizar o termo, dividir em palavras, e chamar a RPC:

```typescript
if (tipo === 'nome') {
  const normalizado = termo.trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const palavras = normalizado.split(/\s+/).filter(p => p.length >= 2);
  
  if (palavras.length === 0) {
    return new Response(JSON.stringify({ produtos: [] }), { headers: ... });
  }

  const { data } = await supabase.rpc('buscar_produtos_master_por_palavras', {
    p_palavras: palavras
  });

  return new Response(JSON.stringify({ produtos: data || [] }), { headers: ... });
}
```

### Por que incluir `nome_base` e `marca`

- `nome_base`: versão simplificada sem quantidade (ex: "FARINHA DE MILHO FLOCÃO MARATÁ") — útil quando o usuário digita sem a gramatura
- `marca`: usuários frequentemente buscam por marca ("marata", "yoki") — se a marca está só nesse campo e não no `nome_padrao`, a busca atual não encontra
- Concatenar os 3 não degrada performance — é uma operação simples em texto com LIMIT 20

### Resultado

- "flocao" → encontra (accent-insensitive via `unaccent`)
- "marata 500" → encontra (multi-palavra AND em campos concatenados)
- "yoki" → encontra mesmo se só estiver no campo `marca`
- Busca rápida (debounce 400ms no frontend + LIMIT 20 no SQL)

