

## Ajuste dos Cards de Estatísticas no Mobile

### Problema
Os 3 cards de estatísticas ("Normalizações Ativas", "Pendentes de Normalização", "Total Geral") estão em `grid-cols-3` fixo no mobile, deixando cada card muito estreito. As descrições longas estouram a largura.

### Solução (em `src/pages/admin/NormalizacoesEstabelecimentos.tsx`, linhas 826-849)

1. **Grid responsivo**: trocar `grid grid-cols-3 gap-4` por `grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4` — empilha verticalmente no mobile, fica em 3 colunas no desktop.

2. **Padding e tipografia adaptativos**:
   - `CardHeader` com `pb-3 px-4 sm:px-6`.
   - `CardDescription` com `text-xs sm:text-sm` e `leading-tight` para evitar quebra estranha.
   - `CardTitle` com `text-2xl sm:text-3xl`.

3. **Texto mais curto onde possível**: manter "Normalizações Ativas", "Pendentes de Normalização", "Total Geral", mas garantindo que o container respire com o `grid-cols-1` no mobile, o problema desaparece naturalmente.

### Garantias
- Apenas ajuste visual; nenhum dado, contagem ou lógica alterada.
- Desktop continua idêntico (3 colunas).
- Mobile passa a exibir os cards em coluna única, com texto inteiro visível.

