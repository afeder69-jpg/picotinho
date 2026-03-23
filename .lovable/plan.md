

## Correção aplicada: Consistência entre Consulta de Preços, Lista de Compras e Tabela Comparativa

### Problema

Os três módulos usavam fontes e métodos de busca diferentes:
- Consulta de Preços: busca estrutural por `produto_master_id`
- Lista/Tabela: busca fuzzy por palavras-chave → encontrava produtos errados com preços diferentes

### Alterações realizadas

**1. `src/components/consultaPrecos/AdicionarListaDialog.tsx`**
- Adicionado `produto_id: produto.id` ao insert, preservando o vínculo com o catálogo master

**2. `supabase/functions/comparar-precos-lista/index.ts`**
- Novo **Passo 0**: se item tem `produto_id` + `cnpjMercado`, busca em `precos_atuais` por `produto_master_id` + `estabelecimento_cnpj`
- Se não encontra naquele mercado específico → retorna `null` (não preenche com preço de outro mercado)
- Fallback fuzzy mantido apenas para itens sem `produto_id` (antigos/manuais)
- Fallback fuzzy agora usa `estabelecimento_cnpj` ao invés de `ilike` no nome do estabelecimento

### Resultado

Itens adicionados via Consulta de Preços usam a mesma busca estrutural em todos os módulos. Cada coluna de mercado mostra apenas preços reais daquele mercado.
