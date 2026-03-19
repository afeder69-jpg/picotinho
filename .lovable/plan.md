

## Plano: Botão circular no /screenshots + abreviar meses

### Alteração 1: Mostrar botão circular no /screenshots
**Arquivo: `src/components/BottomNavigation.tsx`** (linha 881)

O botão central circular de scan só aparece quando `location.pathname === '/'`. Basta expandir a condição para incluir `/screenshots`:

```typescript
{(location.pathname === '/' || location.pathname === '/screenshots') && (
```

Isso faz o botão circular de leitura aparecer na página "Minhas Notas Fiscais" com exatamente o mesmo visual e comportamento da home.

### Alteração 2: Abreviar meses nos resumos
**Arquivo: `src/components/ReceiptList.tsx`** (linhas 934-936)

Trocar `{ month: 'long', year: 'numeric' }` por `{ month: 'short', year: 'numeric' }` e converter para maiúsculas com formatação `ABR/2026`:

```typescript
const label = date.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
// Remove ponto do "abr." e formata como "ABR/2026"
const cleanLabel = label.replace('.', '').split(' de ');
const capitalizedLabel = cleanLabel[0].toUpperCase() + '/' + date.getFullYear();
```

### Resultado
- Botão circular verde de leitura visível na parte inferior da página `/screenshots`, idêntico à home
- Meses exibidos como `MAR/2026`, `FEV/2026`, `JAN/2026`

