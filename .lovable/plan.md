

## Plano: Alinhar leitura de estoque entre WhatsApp e Aplicativo

### Diagnóstico confirmado

**App (EstoqueAtual.tsx):**
- Consolida registros duplicados via normalização de nome (uppercase, remove "KG", "GRANEL GRANEL" → "GRANEL")
- Por padrão oculta itens com `quantidade <= 0` (toggle `mostrarItensZerados`)
- Exibe **duas colunas** de valor: "Valor Pago" (`preco_unitario_ultimo × quantidade`) e "Valor Atual" (preço da área ou fallback para preço pago)
- O resumo por categoria (ex: Hortifruti) conta itens **consolidados** e soma **ambos** os valores

**WhatsApp (picotinho-assistant `buscar_estoque`):**
- Retorna registros brutos da tabela `estoque_app` com `limit(50)`
- Sem consolidação de nomes duplicados
- Sem filtro de zerados
- Soma `preco_unitario_ultimo × quantidade` por registro bruto

**Resultado:** contagem inflada, valor inflado, e limite de 50 pode cortar registros.

### Regra funcional definida pelo usuário

O valor **padrão** do estoque deve usar o **preço pago pelo usuário** (`preco_unitario_ultimo`), não o preço da área. A consulta por "preço atual da área" será uma visão separada, futuramente.

### Correção planejada

**Arquivo:** `supabase/functions/picotinho-assistant/index.ts`

**Mudança na tool `buscar_estoque` (linhas 357-374):**

1. Remover `limit(50)` e usar `limit(500)` para garantir que todos os registros sejam processados antes da consolidação

2. Após a query, aplicar a **mesma lógica de consolidação** do app:

```typescript
// Normalização idêntica ao app (EstoqueAtual.tsx linhas 765-773)
const normalizarNome = (nome: string): string => {
  return nome.toUpperCase().trim()
    .replace(/\s+/g, ' ')
    .replace(/\bKG\b/gi, '')
    .replace(/\bGRANEL\s+GRANEL\b/gi, 'GRANEL')
    .replace(/\s+/g, ' ')
    .trim();
};
```

3. Agrupar por nome normalizado, somando quantidades e mantendo o preço do registro mais recente (`updated_at`)

4. Filtrar itens com `quantidade_total <= 0` por padrão (o app oculta zerados por padrão)

5. Retornar no JSON:
   - `total`: contagem de itens **consolidados** com saldo > 0
   - `valor_total`: soma de `preco_unitario_ultimo × quantidade_consolidada` (preço pago, não preço de área)
   - `itens`: lista consolidada com nome, quantidade, preço, categoria

### Detalhes da implementação

A lógica de consolidação será uma réplica fiel do `Map<string, any>` usado em `EstoqueAtual.tsx` (linhas 776-840):

- Chave = nome normalizado
- Se já existe: somar quantidade, manter preço do registro com `updated_at` mais recente
- Se não existe: criar entrada com valores do registro atual
- Ao final: converter Map para array, filtrar `quantidade_total > 0`, calcular `valor_total`

Nenhuma mudança no webhook, na transcrição ou em outras tools do assistente.

### Resultado esperado

Ao pedir "estoque de hortifruti" no WhatsApp, o assistente retornará a mesma contagem de itens e o mesmo valor total "Valor Pago" exibido no app, usando consolidação e filtro idênticos.

