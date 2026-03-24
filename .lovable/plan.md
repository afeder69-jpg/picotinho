

## Correção: EAN lido pelo scanner não completa a busca

### Diagnóstico

O fluxo em `BuscaProduto.tsx` (linha 100-103):

```typescript
const handleScannerResult = useCallback((ean: string) => {
  setModoScanner(false);  // ← fecha scanner, volta para busca por nome
  buscarPorEan(ean);      // ← chama busca async
}, [buscarPorEan]);
```

O problema é que `setModoScanner(false)` faz o React renderizar imediatamente a tela de busca por nome, que tem `autoFocus` no input (linha 163). No Android, isso abre o teclado virtual instantaneamente, cobrindo qualquer feedback visual. A busca `buscarPorEan` provavelmente executa, mas o spinner de loading fica oculto sob o teclado, e se houver erro na edge function, o toast fica escondido atrás do teclado também.

Além disso, há um problema de UX: ao voltar do scanner, o usuário não deveria cair no modo de busca por nome — deveria ver um estado de "processando EAN".

### Correção — `BuscaProduto.tsx`

**1. Novo estado `buscandoEan`** para representar "scanner fechou, EAN sendo processado":

```typescript
const [buscandoEan, setBuscandoEan] = useState(false);
```

**2. `handleScannerResult`** — fechar scanner e entrar no estado de busca, sem voltar para o input de nome:

```typescript
const handleScannerResult = useCallback((ean: string) => {
  setModoScanner(false);
  setBuscandoEan(true);
  buscarPorEan(ean);
}, [buscarPorEan]);
```

**3. `buscarPorEan`** — limpar `buscandoEan` ao final (sucesso ou erro):

```typescript
// No finally:
setBuscandoEan(false);
```

**4. Renderização** — antes do bloco de busca por nome, mostrar tela de "Buscando produto..." quando `buscandoEan` estiver true:

```typescript
if (buscandoEan) {
  return (
    <div className="bg-card border rounded-lg p-8 text-center space-y-3">
      <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
      <p className="text-sm text-muted-foreground">Buscando produto pelo código...</p>
    </div>
  );
}
```

**5. Remover `autoFocus`** do input de busca por nome (linha 163) — evita que o teclado abra desnecessariamente em qualquer transição de estado.

### Resultado

- Scanner lê o EAN → fecha → mostra loading dedicado → executa busca → exibe resultado ou mensagem de erro
- Teclado do Android não abre automaticamente
- Feedback visual claro durante todo o fluxo

### Arquivo alterado

- `src/components/consultaPrecos/BuscaProduto.tsx`

