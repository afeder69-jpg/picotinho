

## Busca inteligente no Catálogo Master — reutilizando a RPC existente

### Problema atual

A função `buscarProdutosMaster` (linha 447) usa `.ilike` direto no Supabase JS. Isso é case-insensitive mas **não** é accent-insensitive, e trata múltiplos termos separados por `;` como OR (cada termo é uma condição `.or()`), quando o comportamento desejado para palavras dentro de um mesmo termo é AND.

### Solução

Reutilizar a RPC `buscar_produtos_master_por_palavras` que já foi criada na migration anterior. Ela já faz busca em `nome_padrao`, `nome_base` e `marca` com `unaccent`, case-insensitive, e AND entre palavras.

### Alteração

**1 arquivo**: `src/pages/admin/NormalizacaoGlobal.tsx`

Substituir a função `buscarProdutosMaster` (linhas 447-485) por:

```typescript
async function buscarProdutosMaster(termo: string) {
  setBuscandoMaster(true);
  try {
    // Normalizar: remover acentos, lowercase, extrair palavras
    const normalizado = termo.trim().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    
    // Suporte a múltiplos termos com ";" — juntar todas as palavras
    const palavras = normalizado
      .split(/[;\s]+/)
      .filter(p => p.length >= 2);

    if (palavras.length === 0) {
      setResultadosBusca([]);
      return;
    }

    // Usar a mesma RPC da Consulta de Preços
    const { data, error } = await supabase.rpc(
      'buscar_produtos_master_por_palavras',
      { p_palavras: palavras }
    );

    if (error) throw error;
    setResultadosBusca(data || []);
  } catch (error: any) {
    console.error('Erro ao buscar produtos:', error);
    toast({
      title: "Erro na busca",
      description: error.message,
      variant: "destructive"
    });
  } finally {
    setBuscandoMaster(false);
  }
}
```

A RPC retorna `id, nome_padrao, nome_base, marca, categoria, codigo_barras, imagem_url, sku_global, qtd_valor, qtd_unidade, unidade_base`. A tela do Catálogo Master usa `select('*')` atualmente, então campos extras como `total_notas`, `total_usuarios`, `created_at` etc. não virão da RPC. Preciso verificar quais campos a renderização do card usa.

**Ajuste na RPC** (migration SQL): A RPC atual retorna apenas 11 campos e LIMIT 20. Para o Catálogo Master, precisamos:
- Mais campos: `total_notas`, `total_usuarios`, `granel`, `categoria_unidade`, `tipo_embalagem`, `imagem_path`, `created_at`
- LIMIT maior: 50 em vez de 20

A melhor abordagem: criar uma versão estendida da RPC ou simplesmente atualizar a existente para retornar todos os campos usando `RETURNS SETOF produtos_master_global` (retorna todas as colunas automaticamente).

**Migration SQL** — atualizar a RPC:

```sql
CREATE OR REPLACE FUNCTION public.buscar_produtos_master_por_palavras(
  p_palavras TEXT[],
  p_limite INT DEFAULT 20
)
RETURNS SETOF produtos_master_global AS $$
DECLARE
  v_query TEXT;
  v_palavra TEXT;
  v_search TEXT := 'unaccent(lower(COALESCE(nome_padrao,'''') || '' '' || COALESCE(nome_base,'''') || '' '' || COALESCE(marca,'''')))';
BEGIN
  v_query := 'SELECT * FROM produtos_master_global WHERE status = ''ativo''';
  
  FOREACH v_palavra IN ARRAY p_palavras LOOP
    v_query := v_query || ' AND ' || v_search || 
      ' LIKE ''%'' || unaccent(lower(' || quote_literal(v_palavra) || ')) || ''%''';
  END LOOP;
  
  v_query := v_query || ' ORDER BY total_notas DESC NULLS LAST LIMIT ' || p_limite;
  RETURN QUERY EXECUTE v_query;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;
```

Mudanças na RPC:
- `RETURNS SETOF produtos_master_global` em vez de TABLE explícito — retorna todas as colunas
- Parâmetro `p_limite` com default 20 — a Consulta de Preços continua com 20, o Catálogo Master passa 50

### Resumo de alterações

1. **Migration SQL** — atualizar `buscar_produtos_master_por_palavras` para retornar todas as colunas e aceitar limite configurável
2. **`NormalizacaoGlobal.tsx`** — substituir `buscarProdutosMaster` para usar a RPC com `p_limite: 50`

Nenhuma mudança no frontend da Consulta de Preços — o default da RPC mantém o comportamento atual.

