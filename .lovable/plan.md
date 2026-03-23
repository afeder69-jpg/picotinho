
## Correção: Usar client admin para consultas em `precos_atuais`

**Arquivo:** `supabase/functions/comparar-precos-lista/index.ts`

### Alteração 1 — Criar client admin (após linha 28)

Adicionar após o fechamento do `createClient` do usuário:

```typescript
// Client admin para consultas em precos_atuais (ignora RLS, mesma visibilidade da consulta individual)
const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);
```

### Alteração 2 — Linha 146: PASSO 0

Trocar `await supabase` por `await supabaseAdmin` na query `.from('precos_atuais')`.

### Alteração 3 — Linha 223: Passo 3

Trocar `await supabase` por `await supabaseAdmin` na query `.from('precos_atuais')`.

### Alteração 4 — Linha 242: Passo 4

Trocar `await supabase` por `await supabaseAdmin` na query `.from('precos_atuais')`.

### O que NÃO muda

- Passos 1-2 (`precos_atuais_usuario`) continuam com `supabase` do usuário
- Todas as demais operações (perfil, config, itens, invocação de buscar-supermercados-area)
- Nenhuma outra edge function
- Interface

### Resultado

- Comparação enxerga todos os preços em `precos_atuais` (igual à consulta individual)
- Mesmos mercados e valores nas duas telas
