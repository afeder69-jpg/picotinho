
## Correção cirúrgica para o erro de preço no estoque (confirmado)

### Diagnóstico fechado (causa raiz)
1. **`buscar-historico-precos-estoque` está estourando CPU** em cargas maiores (log com `CPU Time exceeded`), então a tela cai no fallback.
2. **Fallback atual (`preco-atual-usuario`) busca `precos_atuais` por similaridade de nome** e pode puxar preço de embalagem (ex.: R$14,65 da bandeja), não preço por unidade.
3. **No `buscar-historico-precos-estoque`, o matching usa `produto_nome_normalizado` sem normalizar novamente**; como muitos registros estão em maiúsculo, a comparação com `nomeItem` minúsculo falha e gera histórico nulo.
4. **No frontend (`EstoqueAtual.tsx`), a consolidação de duplicatas pode manter preço antigo** por sobrescrita na iteração, gerando inconsistência na linha “preço pago”.

---

## O que implementar para não repetir

### 1) Corrigir o backend de histórico (principal)
**Arquivo:** `supabase/functions/buscar-historico-precos-estoque/index.ts`

- **Normalizar sempre** `produto_nome_normalizado` antes de comparar:
  - `const produtoNormalizado = normalizarNomeProduto(produtoEstoque.produto_nome_normalizado || produtoNome)`
- **Refatorar para processamento em lote** (evitar loop produto × notas):
  - Buscar notas do usuário **uma vez**;
  - Buscar notas da área **uma vez**;
  - Processar itens em passagem única e preencher mapa por `produtoId`.
- **Manter conversão segura já existente**:
  - prioridade EAN > nome;
  - `quantidadeFinal = quantidadeComprada * qtd_por_embalagem` quando multiembalagem;
  - sem match seguro => sem conversão.
- **Adicionar guarda de performance**:
  - janela temporal (ex.: últimas N semanas) + limite configurável;
  - retorno parcial controlado em vez de timeout.

---

### 2) Tornar fallback da tela seguro (sem preço enganoso)
**Arquivo:** `src/pages/EstoqueAtual.tsx`

- Em `loadHistoricoPrecos`, se `buscar-historico-precos-estoque` falhar:
  - **não usar fallback por nome que pode distorcer preço de unidade**;
  - mostrar estado “histórico indisponível” e manter preço do próprio estoque.
- Manter `historicoPrecos` **chaveado por `item.id`** apenas para evitar mistura entre produtos parecidos.

---

### 3) Ajustar fallback da função de preço atual para base unitária
**Arquivo:** `supabase/functions/preco-atual-usuario/index.ts`

- No bloco que consulta `precos_atuais`:
  - priorizar `preco_por_unidade_base` quando existir;
  - usar `produto_master_id` quando disponível antes de similaridade textual;
  - reduzir confiança de match por nome (evitar “OVOS …” casar com embalagem sem conversão).
- Se não houver dado confiável por unidade, **não retornar preço “chutado”**.

---

### 4) Corrigir consolidação no frontend (preço pago coerente)
**Arquivo:** `src/pages/EstoqueAtual.tsx` (função `loadEstoque`)

- Na consolidação por chave:
  - somar quantidade normalmente;
  - **preservar preço/data do item mais recente** (por `updated_at`/`created_at`), sem sobrescrever com item antigo.

---

### 5) Saneamento de dados já gravados (1 migration)
**Arquivo novo:** `supabase/migrations/...sql`

- Reprocessar/ajustar registros de `precos_atuais` de ovos com padrão de embalagem:
  - preencher `qtd_base`, `tipo_embalagem`, `preco_por_unidade_base`;
  - ajustar `valor_unitario` para unidade base apenas quando match for seguro.
- Escopo inicial: padrões fixos já aprovados (cartela/bandeja/dúzia/meia dúzia).

---

## Validação (obrigatória)
1. Chamar `buscar-historico-precos-estoque` para o item de ovos do usuário e validar retorno em unidade (não embalagem).
2. Abrir `/estoque` com hard refresh e confirmar que **não aparece mais R$14,65/un** para ovos.
3. Verificar logs: sem `CPU Time exceeded` na busca de histórico.
4. Conferir consistência:
   - preço pago da linha principal coerente com item mais recente;
   - preço de área coerente com unidade base;
   - total = preço × quantidade sem distorção.

---

## Resultado esperado após essa correção
- O estoque para ovos deixa de mostrar valor impossível por unidade.
- A correção passa a ser **estrutural** (performance + matching + fallback seguro), evitando recorrência do mesmo erro em futuras atualizações.
