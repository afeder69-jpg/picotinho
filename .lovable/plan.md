

## Problema

O dropdown "Categoria de Destino" não abre quando clicado dentro do Dialog de "Criar Nova Regra". Isso é um bug conhecido do Radix UI — o `SelectContent` abre atrás do `Dialog` por conflito de z-index e portal.

## Correção

**Arquivo:** `src/pages/RecategorizarProdutosInteligente.tsx`

**Linha 558** — adicionar `position="popper"` e z-index alto no `SelectContent`:

```tsx
// De:
<SelectContent>

// Para:
<SelectContent position="popper" className="z-[9999]">
```

Isso força o dropdown a aparecer acima do overlay do Dialog.

## Resultado

O dropdown de categorias vai abrir normalmente quando clicado dentro do dialog de criar regra.

