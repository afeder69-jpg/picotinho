

## Diagnóstico

Linha 276 de `RecategorizarProdutosInteligente.tsx`:
```tsx
<PageHeader title="Recategorização Inteligente" />
```
Sem prop `backTo`, então `PageHeader` usa o default `backTo="/menu"` (definido na linha 16 do componente). Por isso o botão volta ao menu inicial.

## Correção

Alterar linha 276 para:
```tsx
<PageHeader title="Recategorização Inteligente" backTo="/admin/normalizacao" />
```

Isso faz o botão voltar para Normalização Global Master. Nenhum outro arquivo é alterado.

