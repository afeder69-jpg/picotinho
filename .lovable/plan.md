

## Correção: Exclusão da lista não executa

### Causa raiz

No `ListaCompras.tsx`, o componente `EditarListaDialog` tem um `key` que inclui `editDialogOpen`:

```
key={`edit-${lista?.listas_compras_itens.length}-${editDialogOpen}`}
```

Quando o botão "Excluir Lista" chama `onClose()` (que muda `editDialogOpen` para `false`), o `key` muda, e o React **desmonta e remonta** o componente inteiro. Isso destroi o estado `confirmDeleteOpen` antes do `setTimeout` de 150ms disparar. O AlertDialog nunca aparece, e a exclusão nunca é executada.

### Correção

**1 arquivo**: `src/pages/ListaCompras.tsx`

Remover `editDialogOpen` do `key` do componente. O key deve depender apenas dos dados da lista, não do estado de abertura do dialog:

```typescript
// De:
key={`edit-${lista?.listas_compras_itens.length}-${editDialogOpen}`}
// Para:
key={`edit-${lista?.listas_compras_itens.length}`}
```

Isso em todas as ocorrencias do componente no arquivo (3 vezes).

### Resultado

- `onClose()` fecha o Dialog sem desmontar o componente
- `setTimeout` dispara normalmente e abre o AlertDialog de confirmação
- Usuário confirma e `handleExcluirLista` executa a exclusão no banco
- Navegação para `/listas-compras` acontece após exclusão bem-sucedida

