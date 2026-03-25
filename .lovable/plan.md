

## Plano: RPC + WhatsApp alinhado ao APK (sem alterar o APK)

### Causa raiz confirmada

O APK usa `categoriasEquivalentes()` (de `src/lib/categorias.ts`) que mapeia sinônimos de categorias antes de agrupar:
- "carnes", "frango", "peixe" → AÇOUGUE
- "frios", "laticínios", "queijo" → LATICÍNIOS/FRIOS
- "higiene", "farmácia" → HIGIENE/FARMÁCIA
- etc.

O WhatsApp agrupa pela string bruta do campo `categoria` do banco. Itens com "carnes" não entram em AÇOUGUE, causando a perda de itens e valores.

### Passo 1 — Migration: criar RPC `resumo_estoque_por_categoria`

Função SQL `SECURITY DEFINER` que:
1. Lê todos os registros de `estoque_app` do usuário (sem limit)
2. Normaliza nomes de produtos (uppercase, remove KG, GRANEL duplicado)
3. Consolida duplicados por nome normalizado (soma quantidades, preço do mais recente por `updated_at`)
4. Filtra itens com quantidade total <= 0
5. Normaliza categorias para os 11 termos canônicos usando CASE/WHEN com todos os sinônimos de `src/lib/categorias.ts`
6. Agrupa por categoria normalizada e retorna: `categoria`, `total_itens`, `valor_pago`
7. O cálculo de valor usa `ROUND(preco * quantidade, 2)` por item antes de somar — idêntico ao app

O mapeamento CASE/WHEN incluirá todos os sinônimos do fallbackMap em `categorias.ts`:
- carnes, carne, frango, frangos, peixe, peixes, suínos, bovino → açougue
- frios, laticínios, laticinios, queijo, embutidos, leite, iogurte, manteiga, requeijão → laticínios/frios
- farmácia, farmacia, higiene, cuidados pessoais, sabonete, shampoo, creme dental, remedios, remédios → higiene/farmácia
- frutas, verduras, legumes, hortaliças → hortifruti
- E todos os demais sinônimos presentes no fallbackMap

### Passo 2 — Alterar `buscar_estoque` no `picotinho-assistant/index.ts`

Quando o assistente pedir um resumo geral de estoque (sem filtro de produto específico), a tool `buscar_estoque` chamará:

```typescript
const { data: resumo } = await supabase.rpc('resumo_estoque_por_categoria', { p_user_id: usuarioId });
```

E usará o resultado diretamente para montar a resposta com categorias, contagens e valores — sem recalcular.

Quando for busca por produto específico (`tipo_busca === 'produto'`), mantém a lógica atual de consolidação inline.

Quando for busca por categoria específica (`tipo_busca === 'categoria'`), chamará a RPC e filtrará a categoria desejada do resultado (garantindo que sinônimos sejam mapeados corretamente).

### Passo 3 — Nenhuma alteração no APK

O APK permanece inalterado. A RPC é a "fonte de verdade" que o WhatsApp consome. O APK continua com sua lógica local que já funciona corretamente.

### Resultado esperado

O resumo por categoria do WhatsApp passará a bater exatamente com o APK em quantidade de itens e valor pago, porque ambos usarão a mesma lógica de normalização de categorias e consolidação de produtos.

### Detalhes técnicos

**Arquivos modificados:**
- Nova migration SQL: `resumo_estoque_por_categoria`
- `supabase/functions/picotinho-assistant/index.ts`: alterar case `buscar_estoque` para usar RPC quando aplicável

