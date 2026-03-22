

## Exibir EAN Comercial no modal de consolidação de duplicatas

### Problema
Os produtos no modal de duplicatas mostram nome e SKU, mas não mostram o EAN (código de barras), que é essencial para decidir consolidações.

### Correção

**Arquivo:** `src/pages/admin/NormalizacaoGlobal.tsx`

**Linhas 3117-3119** — Após o SKU, adicionar uma linha para o EAN:

```tsx
<div className="text-xs text-muted-foreground font-mono mt-1 bg-muted px-2 py-1 rounded">
  SKU: {produto.sku_global}
</div>
{produto.codigo_barras && (
  <div className="text-xs text-muted-foreground font-mono mt-1 bg-amber-50 px-2 py-1 rounded border border-amber-200">
    EAN: {produto.codigo_barras}
  </div>
)}
```

O EAN já vem nos dados (a Edge Function faz `select('*')`). Se o produto não tiver EAN, nada será exibido — limpo e sem ruído visual.

O badge do EAN terá fundo âmbar claro para se diferenciar visualmente do SKU e facilitar a leitura rápida durante a análise.

