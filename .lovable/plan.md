

## Causa raiz confirmada por logs

O problema **não é** resolução de master nem raio. A correção anterior funcionou (master `9b9227f1` correto foi resolvido). O raio de 50km inclui o MEGABOX (16.7km).

O problema é esta linha em `comparar-precos-lista/index.ts`, linha 114:

```typescript
const mercados = (resultadoMercados.supermercados || []).slice(0, 3);
```

**O sistema encontra MEGABOX dentro do raio, mas depois descarta porque só pega os 3 mercados mais próximos por distância.** ASSAI, COSTAZUL e SUPERMARKET estão mais perto, então MEGABOX (16.7km) é cortado. Esses 3 mercados próximos não têm BATATA PALHA JA, DOCE SOCOCO, etc. nos seus registros de `precos_atuais`.

Logs confirmam:
- `buscar-supermercados-area`: MEGABOX encontrado a 16.7km, dentro do raio
- `comparar-precos-lista`: "✅ 3 mercados encontrados para comparação" — apenas ASSAI, COSTAZUL, SUPERMARKET
- Todas as buscas de preço são feitas apenas nos CNPJs desses 3: `06057223041951`, `17493338000397`, `07760885001814`
- MEGABOX (`35881333000313`) nunca é consultado

### Correção

**1 linha alterada** em `comparar-precos-lista/index.ts`:

```typescript
// ANTES (linha 114):
const mercados = (resultadoMercados.supermercados || []).slice(0, 3);

// DEPOIS:
const mercados = (resultadoMercados.supermercados || []).slice(0, 15);
```

Usar limite de 15 mercados em vez de 3. Todos os mercados dentro do raio do usuário participam da comparação. A tabela comparativa no frontend já itera dinamicamente sobre `mercadoA`, `mercadoB`, `mercadoC`... então se adapta automaticamente.

**Impacto:**
- Os produtos que só existem em mercados mais distantes (mas dentro do raio) passam a ser encontrados
- BATATA PALHA JA no MEGABOX será consultada e terá preço
- Zero alteração em tabelas, frontend ou outras funções
- A performance pode aumentar ligeiramente (mais mercados = mais consultas), mas é aceitável

