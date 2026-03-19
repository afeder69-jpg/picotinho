

## Plano: Agrupar notas por mês/ano com resumo

### O que muda
No `ReceiptList.tsx`, a lista plana de notas será substituída por seções colapsáveis agrupadas por mês/ano da data de emissão.

### Implementação

**Arquivo: `src/components/ReceiptList.tsx`**

1. **Função de agrupamento** — após carregar e ordenar `receipts`, agrupar por `YYYY-MM` usando a mesma lógica de data de emissão já existente (`dados_extraidos.compra.data_emissao || dados_extraidos.dataCompra || purchase_date || created_at`). Cada grupo terá: label (`Março/2026`), contagem de notas e soma dos valores.

2. **Estado de expansão** — `expandedMonths: Set<string>` para controlar quais meses estão abertos. Inicialmente todos fechados, exceto se `highlightNotaId` estiver presente (abrir o mês correspondente).

3. **Renderização** — substituir o loop `receipts.map(...)` (linhas ~1006-1133) por:
   - Para cada grupo mês/ano, renderizar um header clicável com:
     - Nome do mês/ano (ex: "Março/2026")
     - Quantidade de notas (ex: "18 notas")
     - Valor total (ex: "R$ 2.845,90")
   - Ao clicar no header, toggle do mês no `expandedMonths`
   - Se expandido, renderizar os cards de nota existentes (sem alterar o card individual)

4. **Componentes UI** — usar `Collapsible` do Radix (já disponível em `src/components/ui/collapsible.tsx`) ou simplesmente renderização condicional com o estado `expandedMonths`.

### O que NÃO muda
- Lógica de carregamento de dados
- Card individual de cada nota
- Dialog de detalhes
- Exclusão de notas
- Qualquer lógica de processamento

### Detalhes técnicos
- Arquivo alterado: apenas `src/components/ReceiptList.tsx`
- Função auxiliar `parsePurchaseDate(receipt)` para converter os diversos formatos de data (DD/MM/YYYY, ISO, etc.) em `Date`, reutilizando a lógica já presente em `formatPurchaseDate`
- Agrupamento via `Map<string, Receipt[]>` com chave `YYYY-MM`
- Meses em português via `toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })` com capitalize

