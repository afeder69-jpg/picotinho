

## Plano: Diagnóstico e limpeza completa de masters duplicados

### Situacao atual

Consultei a base e encontrei **21 grupos** de masters com mesmo `nome_base + marca`. Mas nem todos sao duplicatas reais — alguns sao produtos legitimos com tamanhos diferentes (ex: KETCHUP HEINZ 397G vs 1KG).

**Duplicatas reais confirmadas** (mesmo nome, mesma gramatura):
| Produto | Qtd | Tipo |
|---------|-----|------|
| CIF Multiuso Cremoso Original 250ml | 4 | Mesmo EAN |
| PATINHO BOVINO | 3 | Mesmo nome, sem EAN |
| GUARDANAPO KITCHEN 50 UN | 3 | Mesmo nome |
| AÇÚCAR REFINADO UNIÃO 1KG | 3 | Mesmo nome |
| CREME DE LEITE GLORIA 200G | 2 | Mesmo nome |
| LEITE UHT INTEGRAL ITALAC 1L | 2 | Mesmo nome |
| CAFÉ PILÃO TRADICIONAL 500G | 2 | Mesmo nome |
| LEITE CONDENSADO PIRACANJUBA 395G | 2 | Mesmo nome |
| MILHO VERDE PREDILECTA 170G | 2 | Mesmo nome |
| LASANHA SEARA 600G | 2 | Mesmo nome |
| OVOS MANTIQUEIRA BRANCO 30 UN | 2 | Mesmo nome (ordem diferente) |

**NAO sao duplicatas** (produtos diferentes, corretamente separados):
- KETCHUP HEINZ 397G vs 1KG (tamanhos diferentes)
- MAIONESE HELLMANNS TRAD vs LIGHT (variantes diferentes)
- GELEIA LINEA 230G vs DIET MORANGO (sabores diferentes)
- CHÁ MATTE LEÃO LIMÃO vs NATURAL (sabores diferentes)
- BISCOITO BONO vs PASSATEMPO (produtos diferentes)
- NESCAU 350G vs 370G (tamanhos diferentes)
- SABÃO TIXAN YPÊ 1,3KG vs 1,6KG (tamanhos diferentes)
- VEJA ORIGINAL 750ML vs 500ML (tamanhos diferentes)

### Plano em 3 etapas

**Etapa 1 — Limpeza imediata dos duplicados reais**

Usar a Edge Function `consolidar-masters-duplicados` que ja existe. Ela agrupa por `nome_base + marca`, mantém o master com mais notas (ou mais antigo), e deleta os outros criando sinônimos.

Porém, ela consolida TODOS os grupos cegamente, inclusive os que nao sao duplicatas (HEINZ 397G vs 1KG). Para evitar isso, vou criar uma **nova Edge Function `diagnosticar-masters-duplicados`** que:

1. Busca todos os grupos com mesmo `nome_base + marca`
2. Dentro de cada grupo, aplica as mesmas regras de `detectar-duplicatas-master` (diferença de gramatura <= 15%, mesma unidade, mesma categoria)
3. Retorna dois conjuntos: **duplicatas reais** (para consolidar) e **falsos positivos** (para ignorar)
4. Consolida automaticamente apenas as duplicatas reais

**Etapa 2 — Prevenção: check de EAN em `criarProdutoMaster`**

Na função `processar-normalizacao-global`, antes de criar um master novo:
- Se tem `codigo_barras`, verificar se já existe master ativo com esse EAN
- Se encontrar, retornar o existente em vez de criar duplicata

**Etapa 3 — Reordenar fluxo: EAN -> IA -> Fuzzy**

Conforme aprovado na conversa anterior: adicionar Estratégia 0 (busca por EAN) e fazer o fuzzy virar gerador de candidatos para a IA.

### Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/diagnosticar-masters-duplicados/index.ts` | **Nova** — diagnóstico + limpeza inteligente |
| `supabase/functions/processar-normalizacao-global/index.ts` | Check EAN em `criarProdutoMaster` + reordenação EAN->IA->Fuzzy |

### Resultado esperado

- ~11 grupos de duplicatas reais consolidados automaticamente
- ~10 grupos de produtos legítimos preservados intactos
- Nenhum master novo duplicado criado no futuro (guard por EAN + IA)

