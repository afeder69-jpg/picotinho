

## Conversao de embalagem para unidade base — Fase 1 (revisado)

### Ajustes incorporados do feedback

1. **RLS restrita a service_role** — tabela e infraestrutura interna, leitura apenas por service_role
2. **EAN tem prioridade sobre nome** — ordem de avaliacao explicita: EAN primeiro, nome depois
3. **Rastreabilidade completa da compra original** — preservar quantidade original, unidade original e preco original nos campos existentes
4. **Sem conversao em caso de duvida** — se nenhuma regra bater com seguranca, comportamento normal inalterado

### 1. Migration SQL

```sql
CREATE TABLE regras_conversao_embalagem (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_pattern text NOT NULL,
  produto_exclusao_pattern text,
  ean_pattern text,
  tipo_embalagem text NOT NULL,
  qtd_por_embalagem integer NOT NULL,
  unidade_consumo text NOT NULL DEFAULT 'UN',
  tipo_conversao text NOT NULL DEFAULT 'fixa',
  prioridade integer NOT NULL DEFAULT 100,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE regras_conversao_embalagem ENABLE ROW LEVEL SECURITY;

-- Somente service_role pode ler (infraestrutura interna)
CREATE POLICY "Service role pode ler regras"
  ON regras_conversao_embalagem FOR SELECT
  TO service_role
  USING (true);

-- Regras iniciais (conversoes fixas e confiaveis)
INSERT INTO regras_conversao_embalagem
  (produto_pattern, produto_exclusao_pattern, tipo_embalagem, qtd_por_embalagem, unidade_consumo, prioridade)
VALUES
  ('\b(OVO|OVOS)\b.*\bC\/30\b', '\b(MASSA|MACARRAO|PASCOA|CHOCOLATE)\b', 'CARTELA', 30, 'UN', 10),
  ('\b(OVO|OVOS)\b.*\bC\/20\b', '\b(MASSA|MACARRAO|PASCOA|CHOCOLATE)\b', 'CARTELA', 20, 'UN', 10),
  ('\b(OVO|OVOS)\b.*\bC\/12\b', '\b(MASSA|MACARRAO|PASCOA|CHOCOLATE)\b', 'CARTELA', 12, 'UN', 10),
  ('\b(OVO|OVOS)\b.*\bC\/6\b',  '\b(MASSA|MACARRAO|PASCOA|CHOCOLATE)\b', 'CARTELA', 6, 'UN', 10),
  ('\b(OVO|OVOS)\b.*\bDUZIA\b', '\b(MASSA|MACARRAO|PASCOA|CHOCOLATE)\b', 'DUZIA', 12, 'UN', 20),
  ('\bMEIA\s*DUZIA\b.*\b(OVO|OVOS)\b', '\b(MASSA|MACARRAO|PASCOA|CHOCOLATE)\b', 'MEIA_DUZIA', 6, 'UN', 15);
```

Nenhuma regra com `qtd_por_embalagem = 0` (captura dinamica). Fase 1 so usa valores fixos e confiaveis.

### 2. Logica de prioridade: EAN > Nome

A funcao `detectarQuantidadeEmbalagem` refatorada avalia em duas passadas:

```text
Passada 1: Testar regras que tem ean_pattern contra o EAN do produto
           (se ean_pattern definido E EAN disponivel → match por EAN)

Passada 2: Testar regras por produto_pattern contra o nome
           (somente se nenhuma regra bateu por EAN)

Em ambas: testar produto_exclusao_pattern para rejeitar falsos positivos
```

Se nenhuma regra bater → retorna `isMultiUnit: false`, sem conversao.

### 3. Rastreabilidade completa da compra original

Na insercao do estoque (`process-receipt-full`, linha ~1346), quando embalagem e detectada:

| Campo | Valor | Significado |
|---|---|---|
| `quantidade` | 30 | Quantidade convertida (unidade de consumo) |
| `preco_unitario_ultimo` | 0.70 | Preco por unidade de consumo |
| `unidade_medida` | "Un" | Unidade de consumo |
| `tipo_embalagem` | "CARTELA" | Tipo da embalagem original |
| `qtd_valor` | 1 | Quantidade original comprada (1 cartela) |
| `qtd_base` | 30 | Unidades na embalagem |
| `unidade_base` | "un" | Unidade base de consumo |
| `preco_por_unidade_base` | 0.70 | Preco na unidade base |

Os campos `qtd_valor` e `tipo_embalagem` preservam a compra original. O preco original da nota permanece intacto em `dados_extraidos` da `notas_imagens`.

### 4. Alteracoes por arquivo

| Arquivo | Alteracao |
|---|---|
| **Migration SQL** | Criar `regras_conversao_embalagem` com RLS service_role + dados iniciais |
| **`process-receipt-full`** | Refatorar `detectarQuantidadeEmbalagem` (linhas 54-92): carregar regras da tabela no inicio, avaliar EAN primeiro depois nome, preencher campos de rastreabilidade na insercao (linhas 1346-1358) |
| **`backfill-precos-usuario`** | Mesma refatoracao da funcao (linhas 16-50), carregar regras no inicio |
| **`preco-atual-usuario`** | Mesma refatoracao (linhas 18-50) |
| **`calcular-custo-receita`** | Mesma refatoracao (linhas 52-90) |
| **`processar-normalizacao-global`** | Mesma refatoracao (linhas 8-40) |

### 5. Carregamento das regras

Cada edge function carrega as regras uma unica vez no inicio da execucao usando `supabaseAdmin` (service_role):

```typescript
const { data: regrasConversao } = await supabaseAdmin
  .from('regras_conversao_embalagem')
  .select('*')
  .eq('ativo', true)
  .eq('tipo_conversao', 'fixa')
  .order('prioridade', { ascending: true });
```

### 6. Nenhuma alteracao no frontend

O `EstoqueAtual.tsx` ja exibe `quantidade` e `preco_unitario_ultimo`, que passarao a refletir valores convertidos automaticamente.

