

## Remover texto "Ajustar" do botão de ajuste de estoque

### Alteração

**1 arquivo**: `src/pages/EstoqueAtual.tsx` — linha 1940

Remover o texto "Ajustar" do botão, mantendo apenas o ícone `<Edit3>`. Adicionar `title="Ajustar"` no botão para acessibilidade (tooltip nativo ao passar o mouse).

```tsx
// De:
<Edit3 className="w-3 h-3" />
Ajustar

// Para:
<Edit3 className="w-3 h-3" />
```

Adicionar `title="Ajustar"` como prop do `<Button>` para manter clareza ao usuário.

