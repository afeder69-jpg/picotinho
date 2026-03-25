

## Plano: Corrigir fluxo de criação de lista de compras

### Causa raiz identificada

Dois problemas distintos:

**1. Frontend engole erro da Edge Function**

`supabase.functions.invoke()` nem sempre popula o campo `error` para respostas HTTP 400. Em muitos casos, o erro da Edge Function vem dentro de `data.error`, mas o frontend só verifica `if (error) throw error` — ignorando o erro real. Resultado: o frontend tenta navegar para `/lista-compras/${data.listaId}` onde `data.listaId` é `undefined`, causando comportamento silencioso ou erro genérico.

**2. Sem atomicidade na Edge Function**

A Edge Function faz duas operações sequenciais sem rollback:
1. INSERT em `listas_compras` (pode suceder)
2. INSERT em `listas_compras_itens` (pode falhar)

Se o passo 2 falha, a lista já foi criada no banco — gerando estado inconsistente (lista órfã sem itens). O erro é retornado ao frontend, mas a lista persiste.

### Correção

**Arquivo 1: `supabase/functions/gerar-lista-otimizada/index.ts`**

- Adicionar rollback: se a inserção de itens falhar, deletar a lista recém-criada antes de retornar o erro
- Usar o client autenticado (que já tem permissão de DELETE pela RLS) para o rollback

```typescript
// Após falha na inserção de itens:
if (itensError) {
  // Rollback: remover lista órfã
  await supabase.from('listas_compras').delete().eq('id', lista.id);
  throw itensError;
}
```

**Arquivo 2: `src/components/listaCompras/CriarListaDialog.tsx`**

- Verificar `data?.error` além de `error` para capturar erros da Edge Function que vêm no body da resposta
- Melhorar mensagem de erro com detalhes do backend

```typescript
const { data, error } = await supabase.functions.invoke('gerar-lista-otimizada', { body: {...} });

if (error) throw error;
if (data?.error) throw new Error(data.error);

// Só navega se listaId existe
if (!data?.listaId) throw new Error('Lista não retornada');
```

### Resultado esperado

- Se tudo funciona: lista criada, itens inseridos, navegação para a lista
- Se falha: erro claro no toast, nenhuma lista órfã no banco, estado consistente

### Escopo

- 2 arquivos alterados
- Nenhuma migration necessária
- Nenhuma alteração de schema

