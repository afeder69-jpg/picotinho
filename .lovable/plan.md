

## Analise cirurgica da inconsistencia de precos de ovos no estoque

### Evidencias encontradas no banco de dados

Consultei os dados reais das notas fiscais e do estoque. Dois registros estao com erro:

**Nota do Megabox (19/03)** — nota `e3fce8f4`:
- Recibo original: `OVOS BCO CARTELA 30UN`, qty=1, valor_unitario=R$18.60 (preco da cartela com desconto)
- Armazenado no estoque: `Ovos Brancos`, qty=30, preco_unitario_ultimo=**R$18.60**/un
- O sistema extraiu a quantidade 30 do nome, mas NAO dividiu o preco. Resultado: R$18.60 ficou como preco por OVO em vez de R$18.60/30 = R$0.62/un

**Nota do Assai (20/03)** — nota `51c5e880`:
- Recibo original: `Ovos Brancos Extra Mantiqueira Pvc Bandeja 20 Un`, **qty=3**, valor_unitario=R$14.65 (preco por bandeja)
- Armazenado no estoque: qty=20, preco_unitario_ultimo=R$2.1975/un
- O sistema extraiu 20 unidades do nome e dividiu R$43.95/20 = R$2.1975. Mas **ignorou que eram 3 bandejas**. Deveria ser 3×20=60 ovos a R$43.95/60=R$0.73/un

### Causa raiz: 2 bugs no `process-receipt-full`

**Bug 1 — Linha 1347**: A quantidade original do recibo (`item.quantidade`) e ignorada quando a conversao de embalagem dispara.

```text
// CODIGO ATUAL (errado):
quantidadeFinal = embalagemInfo.quantity    // Usa so as unidades da embalagem (ex: 20)

// CORRETO:
quantidadeFinal = item.quantidade * embalagemInfo.quantity    // 3 bandejas × 20 = 60
```

Esse bug afeta TODOS os casos onde o usuario compra mais de 1 embalagem do mesmo produto.

**Bug 2 — Padroes de regex insuficientes na tabela `regras_conversao_embalagem`**: Os padroes atuais so detectam formatos como `C/30`, `C/20`, `DUZIA`. Mas recibos reais usam tambem:
- `CARTELA 30UN` (Megabox)
- `BANDEJA 20 UN` (Assai)
- `20 UNIDADES` (outros mercados)

### Correcao proposta

**1. Corrigir a multiplicacao pela quantidade original** (1 linha em `process-receipt-full`)

Linha 1347:
```typescript
// De:
const quantidadeFinal = embalagemInfo.isMultiUnit ? embalagemInfo.quantity : item.quantidade;

// Para:
const quantidadeFinal = embalagemInfo.isMultiUnit ? (item.quantidade * embalagemInfo.quantity) : item.quantidade;
```

E ajustar o calculo do `valorTotal` passado para a funcao (linha 1343) — o `precoTotal` ja esta correto pois e `item.quantidade * item.valor_unitario`.

Tambem ajustar `qtd_valor` na rastreabilidade (linha 1392) para que `item.quantidade` continue refletindo a quantidade original comprada (ex: 3 bandejas).

**2. Adicionar novos padroes na tabela de regras** (migration SQL)

```sql
-- Capturar "CARTELA 30UN", "CARTELA 20UN", etc.
INSERT INTO regras_conversao_embalagem
  (produto_pattern, produto_exclusao_pattern, tipo_embalagem, qtd_por_embalagem, unidade_consumo, prioridade)
VALUES
  ('\b(OVO|OVOS)\b.*\bCARTELA\b.*\b30\b', '\b(MASSA|MACARRAO|PASCOA|CHOCOLATE)\b', 'CARTELA', 30, 'UN', 10),
  ('\b(OVO|OVOS)\b.*\bCARTELA\b.*\b20\b', '\b(MASSA|MACARRAO|PASCOA|CHOCOLATE)\b', 'CARTELA', 20, 'UN', 10),
  ('\b(OVO|OVOS)\b.*\bCARTELA\b.*\b12\b', '\b(MASSA|MACARRAO|PASCOA|CHOCOLATE)\b', 'CARTELA', 12, 'UN', 10),
  ('\b(OVO|OVOS)\b.*\bBANDEJA\b.*\b30\b', '\b(MASSA|MACARRAO|PASCOA|CHOCOLATE)\b', 'BANDEJA', 30, 'UN', 10),
  ('\b(OVO|OVOS)\b.*\bBANDEJA\b.*\b20\b', '\b(MASSA|MACARRAO|PASCOA|CHOCOLATE)\b', 'BANDEJA', 20, 'UN', 10),
  ('\b(OVO|OVOS)\b.*\bBANDEJA\b.*\b12\b', '\b(MASSA|MACARRAO|PASCOA|CHOCOLATE)\b', 'BANDEJA', 12, 'UN', 10),
  ('\b(OVO|OVOS)\b.*\b30\s*UN', '\b(MASSA|MACARRAO|PASCOA|CHOCOLATE)\b', 'CARTELA', 30, 'UN', 25),
  ('\b(OVO|OVOS)\b.*\b20\s*UN', '\b(MASSA|MACARRAO|PASCOA|CHOCOLATE)\b', 'CARTELA', 20, 'UN', 25),
  ('\b(OVO|OVOS)\b.*\b12\s*UN', '\b(MASSA|MACARRAO|PASCOA|CHOCOLATE)\b', 'CARTELA', 12, 'UN', 25),
  ('\b(OVO|OVOS)\b.*\b6\s*UN', '\b(MASSA|MACARRAO|PASCOA|CHOCOLATE)\b', 'CARTELA', 6, 'UN', 25);
```

**3. Replicar a correcao da multiplicacao nas demais edge functions**

Mesma correcao de `item.quantidade * embalagemInfo.quantity` em:
- `backfill-precos-usuario`
- `preco-atual-usuario`
- `calcular-custo-receita`
- `processar-normalizacao-global`

**4. Corrigir os dados historicos errados** (migration SQL)

Atualizar os 2 registros especificos identificados:

```sql
-- Megabox: qty=30 esta OK, mas preco deve ser 18.6/30
UPDATE estoque_app SET preco_unitario_ultimo = 0.62
  WHERE id = 'fc018097-0422-4746-896f-a57688eefbb6';

-- Assai: qty deve ser 60 (3×20), preco deve ser 43.95/60
UPDATE estoque_app SET quantidade = 60, preco_unitario_ultimo = 0.7325
  WHERE id = '7dbeddc1-59d5-4081-b624-09e2c9bd9233';
```

### Resumo das alteracoes

| Componente | Alteracao |
|---|---|
| `process-receipt-full` | Corrigir linha 1347: multiplicar `item.quantidade × embalagemInfo.quantity` |
| Migration SQL | Adicionar padroes CARTELA/BANDEJA/NN UN na tabela de regras |
| Migration SQL | Corrigir os 2 registros historicos com dados errados |
| 4 edge functions | Replicar mesma correcao de multiplicacao |

### Validacao pos-correcao

Com as correcoes:
- Megabox: 1 × 30 = 30 ovos a R$18.60/30 = R$0.62/un (T: R$18.60) ✓
- Assai: 3 × 20 = 60 ovos a R$43.95/60 = R$0.73/un (T: R$43.95) ✓
- Qualquer compra futura de N embalagens sera multiplicada corretamente

