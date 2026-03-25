

## Diagnóstico: Divergência residual de valor entre WhatsApp e APK

### Causa raiz identificada

A RPC agrupa por **nome + categoria** (`GROUP BY nome_normalizado, categoria_normalizada`), enquanto o APK agrupa **apenas por nome** (`Map<chave>` onde `chave = normalizarNomeProduto(nome)`).

**Consequência**: Se o mesmo produto aparece no banco com categorias diferentes (ex: um registro como "hortifruti" e outro como "mercearia"), a RPC cria **duas entradas consolidadas separadas** (uma em cada categoria), enquanto o APK **une tudo num único item** sob a categoria do primeiro registro encontrado.

Isso causa:
- **Preço diferente**: a RPC pode selecionar um preço "mais recente" diferente para cada fatia do produto, enquanto o APK seleciona um único preço para o produto inteiro
- **Valor por categoria diferente**: a quantidade e o valor ficam distribuídos entre categorias na RPC, mas concentrados numa única categoria no APK
- **Contagem correta por coincidência**: as contagens batem porque o total de itens consolidados é o mesmo — apenas a distribuição entre categorias e o preço selecionado mudam

### Correção

Alterar a RPC para replicar exatamente a lógica do APK:

1. **Consolidar apenas por `nome_normalizado`** (sem incluir categoria no GROUP BY)
2. **Atribuir a categoria do registro mais recente** (`updated_at DESC`) ao item consolidado — igual ao que o APK faz implicitamente (o primeiro registro no Map define a categoria, os seguintes herdam)
3. Manter o restante da lógica (arredondamento, filtro de zerados, soma por categoria)

### Implementação

**Arquivo**: Nova migration SQL (substituindo a função `resumo_estoque_por_categoria`)

```sql
-- CTE consolidado passa a agrupar SÓ por nome:
consolidado AS (
  SELECT
    n.nome_normalizado,
    SUM(n.quantidade) AS qtd_total,
    (ARRAY_AGG(n.preco_unitario_ultimo ORDER BY n.updated_at DESC))[1] AS preco_mais_recente,
    (ARRAY_AGG(n.categoria_normalizada ORDER BY n.updated_at DESC))[1] AS categoria_do_mais_recente
  FROM normalizado n
  GROUP BY n.nome_normalizado
  HAVING SUM(n.quantidade) > 0
)
SELECT
  c.categoria_do_mais_recente::text AS categoria,
  COUNT(*)::bigint AS total_itens,
  ROUND(SUM(ROUND(COALESCE(c.preco_mais_recente,0) * c.qtd_total, 2)), 2)::numeric AS valor_pago
FROM consolidado c
GROUP BY c.categoria_do_mais_recente
ORDER BY valor_pago DESC;
```

**Nenhuma alteração no APK nem na Edge Function** — apenas a RPC é corrigida.

### Resultado esperado

Após a correção, a RPC produzirá exatamente os mesmos agrupamentos, preços e valores que o APK, eliminando as divergências residuais em Hortifruti, Mercearia e Bebidas.

