

## Plano: Corrigir exibicao da unidade de medida na lista de compras

### Problema

O banco armazena categorias genéricas de medida: `PESO`, `UNIDADE`, `VOLUME`. Na tela, esses valores aparecem por extenso e em maiúsculas, quando deveriam mostrar abreviações de embalagem como "pct", "un", etc.

### Solução

Alterar apenas o `ItemProdutoLista.tsx` para formatar a unidade antes de exibir, usando um mapeamento simples:

| Valor no banco | Exibição |
|---|---|
| PESO | pct |
| VOLUME | un |
| UNIDADE | un |
| outros (kg, g, ml, etc.) | usar `formatarUnidadeMedida` existente |

### Arquivo a modificar

**`src/components/listaCompras/ItemProdutoLista.tsx`** (linha 44-45)

Adicionar função local de mapeamento antes do render:

```typescript
function formatarUnidadeItem(unidade: string): string {
  const upper = unidade.toUpperCase().trim();
  if (upper === 'PESO') return 'pct';
  if (upper === 'VOLUME') return 'un';
  if (upper === 'UNIDADE') return 'un';
  return formatarUnidadeMedida(unidade);
}
```

E na linha 45, trocar `{item.unidade_medida}` por `{formatarUnidadeItem(item.unidade_medida)}`.

Nenhum outro arquivo será alterado. Checkboxes, maiúsculas nos nomes e demais estilos permanecem como estão.

