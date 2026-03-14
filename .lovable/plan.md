

# Plano: Priorização do EAN na Normalização de Produtos

## Situação Atual Identificada

| Item | Status |
|---|---|
| `produtos_master_global.codigo_barras` | Existe (text, nullable) |
| Índice em `codigo_barras` | Existe (`idx_produtos_master_codigo_barras`) |
| `estoque_app.ean_comercial` | Não existe |
| NFe Serpro | Já extrai `item.prod.cEAN` como `codigo_barras` nos itens |
| NFCe InfoSimples | **Não extrai** EAN — campo disponível na API mas ignorado |
| OpenAI fallback | **Não extrai** EAN |
| `process-receipt-full` | **Nunca usa** EAN para matching — vai direto para IA/fuzzy |

## Alterações Planejadas

### 1. Migration SQL (mínima)

- Adicionar coluna `ean_comercial` (text, nullable) em `estoque_app`
- Criar índice parcial em `estoque_app(ean_comercial)` para valores não nulos
- Índice em `produtos_master_global.codigo_barras` já existe — nada a fazer

### 2. Extração do EAN nas 3 fontes

**A. NFe Serpro** — Já extrai `cEAN`. Nenhuma alteração necessária.

**B. NFCe InfoSimples** (`process-nfce-infosimples/index.ts`)
- Acrescentar 1 campo no `return` do mapeamento de produtos (~linha 439):
```typescript
codigo_barras: limparEAN(p.codigo_barras_comercial || p.ean_comercial || p.codigo_barras) || null,
```

**C. OpenAI fallback** (`extract-receipt-image/index.ts`)
- Acrescentar `"codigo_barras"` no JSON de extração do prompt, marcado como complementar/opcional.

### 3. Propagação do EAN no `process-receipt-full`

**A. Carregar EAN dos dados extraídos** (~linhas 1207-1260)
- Nos 3 formatos de parsing (InfoSimples, consolidados, itens), acrescentar captura de `codigo_barras` / `ean_comercial` do item.

**B. Propagação na consolidação** (~linha 1332)
- Incluir `ean_comercial` no objeto do produto consolidado.

**C. Nova etapa ANTES da IA** (~linha 1390, antes do loop de matching)
- Função `limparEAN(valor)`: remove espaços, valida somente dígitos, rejeita "SEM GTIN", "SEM EAN", "0", sequências zeradas, códigos < 8 dígitos.
- Para cada produto com EAN válido:
  1. Buscar em `produtos_master_global` WHERE `codigo_barras = ean`
  2. Se encontrou exatamente 1 master → vincular direto (confiança 100%, sem IA)
  3. Se encontrou múltiplos → log de alerta, seguir para IA (inconsistência)
  4. Se não encontrou → seguir fluxo normal (IA + fuzzy)

**D. Persistência segura do EAN no master** (~linha 1463, quando master é encontrado/criado)
- Regras de segurança ao gravar `codigo_barras` no master:
  - Se master novo (criado via candidato): gravar normalmente
  - Se master existente sem `codigo_barras`: verificar se o EAN não está em outro master; só gravar se não houver conflito
  - Se master existente com `codigo_barras` diferente: não sobrescrever, logar inconsistência
  - Se master existente com mesmo `codigo_barras`: nada a fazer

**E. Inserção no estoque** (~linha 1677)
- O campo `ean_comercial` já estará no objeto produto e será inserido automaticamente na tabela `estoque_app`.

### 4. Nenhuma alteração no frontend

Nenhuma tela, componente ou rota será modificada.

## Arquivos Modificados

| Arquivo | Alteração |
|---|---|
| Migration SQL (nova) | `ADD COLUMN ean_comercial` em `estoque_app` + índice parcial |
| `process-nfce-infosimples/index.ts` | +1 campo: `codigo_barras` no return do mapeamento |
| `extract-receipt-image/index.ts` | +1 linha no prompt: pedir `codigo_barras` |
| `process-receipt-full/index.ts` | +~80 linhas: função `limparEAN`, busca por EAN antes da IA, persistência segura no master, propagação para estoque |

## Garantias

- Nenhuma tabela renomeada ou removida
- Nenhum campo existente alterado ou deletado
- Fluxo de IA + fuzzy matching permanece intacto como fallback
- Nenhuma tela ou componente frontend é alterado
- Apenas acréscimos pontuais e seguros

