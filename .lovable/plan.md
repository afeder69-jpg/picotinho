

## Corrigir layout da Normalização Global Master no mobile

### Problema
A `TabsList` com 5 abas (Pendentes, Catálogo Master, Raspagem de Imagens, Suporte, Campanhas) fica em uma linha horizontal que extrapola a largura da tela no celular, obrigando o usuário a rolar a página inteira para o lado.

### Solucao

**Arquivo: `src/pages/admin/NormalizacaoGlobal.tsx`**

1. **Container da pagina (linha 2262)**: Reduzir o padding em mobile de `p-6` para `px-3 py-4 md:p-6` para aproveitar melhor o espaco.

2. **Header (linha 2264-2270)**: Ajustar o titulo para `text-xl md:text-3xl` e o icone para `w-6 h-6 md:w-8 md:h-8` em mobile.

3. **TabsList (linhas 2662-2683)**: Tornar a lista de abas responsiva com duas abordagens combinadas:
   - Adicionar `flex-wrap` na `TabsList` para que as abas quebrem em multiplas linhas no mobile em vez de extrapolarem
   - Ajustar a altura da `TabsList` com `h-auto` para acomodar as linhas extras
   - Nos `TabsTrigger`, usar `text-xs md:text-sm` e reduzir padding para versoes compactas no mobile
   - Esconder os icones das abas em mobile (`hidden md:block`) para economizar espaco, mantendo apenas o texto

4. **Cards de estatisticas e grids internas**: Verificar se ha `grid-cols-3` ou similares que tambem estourem — ajustar para `grid-cols-1 sm:grid-cols-3` onde necessario (ex: relatorio de consolidacao na linha 2615).

### Detalhes tecnicos
- A `TabsList` do shadcn/ui usa `inline-flex` por padrao — sobrescrever com classes `flex flex-wrap h-auto` resolve o overflow
- Manter funcionalidade identica, apenas ajustes de CSS/Tailwind

