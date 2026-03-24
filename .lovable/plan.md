

## Correção: botão "Excluir Lista" trava a tela

### Causa raiz

O `AlertDialog` de confirmação (linha 434) está sendo aberto **por cima** do `Dialog` de edição (linha 289), que continua aberto. Ambos renderizam overlays (`fixed inset-0 bg-black/80`) com `z-50`. O resultado:

- Duas camadas de overlay bloqueiam toda a interação
- O AlertDialog fica preso atrás do overlay do Dialog principal
- A tela fica completamente travada — não dá para cancelar nem confirmar

### Correção

**1 arquivo**: `src/components/listaCompras/EditarListaDialog.tsx`

Fechar o Dialog de edição **antes** de abrir o AlertDialog de confirmação. Quando o usuário clica "Excluir Lista":

1. Fechar o Dialog de edição (`onClose()`)
2. Abrir o AlertDialog de confirmação (`setConfirmDeleteOpen(true)`)

E mover o AlertDialog para fora do fluxo do Dialog, garantindo que ele só renderize quando o Dialog já estiver fechado.

```typescript
// Botão "Excluir Lista" — fecha o dialog de edição primeiro
onClick={() => {
  onClose();                       // fecha Dialog de edição
  setConfirmDeleteOpen(true);      // abre AlertDialog de confirmação
}}
```

Além disso, o AlertDialog precisa tratar o caso de cancelamento — ao cancelar, reabrir o Dialog de edição não é necessário (o usuário volta para a tela da lista normalmente).

### Resultado esperado

- Clicar em "Excluir Lista" → Dialog de edição fecha → confirmação aparece sozinha
- "Cancelar" → volta para a tela da lista (sem travamento)
- "Sim, excluir" → exclui lista → navega para `/listas-compras`
- Nenhum overlay duplo, nenhum travamento

