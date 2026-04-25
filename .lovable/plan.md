## Fase 2 — Finalização (Reprocessamento Sequencial)

### Estado atual confirmado no banco
- **23 notas totais**, **19 processadas**, **4 pendentes**
- **309 itens em estoque**, **100% com preço > 0** ✅
- **R$ 5.055,34** em valor recuperado
- **69,58%** de cobertura de `produto_master_id`

### Notas pendentes (a reprocessar, uma por vez)
1. `87fd3951-d76c-47f7-957e-415f30dd037a` (criada 2026-03-14)
2. `b3bee413-21b3-4a0b-9790-5289d5aac598` (criada 2026-04-14) — **descoberta extra**
3. `5d100c72-f33a-4c23-86f6-41f058fd0c1f` (criada 2026-04-15)
4. `db308873-8d02-49ae-83c9-c0f5d06c6901` (criada 2026-04-17)

Todas estão com `processada=false`, `status_processamento='processada'`, sem `erro_mensagem` registrado — indicando que o gateway timeout interrompeu antes da finalização, mas sem persistir erro.

### Plano de execução (estritamente sequencial)

**Sem alterar código.** Apenas operações de dados + invocações da função existente `process-receipt-full` (já corrigida na Fase 2.2).

Para **cada uma das 4 notas**, executar nesta ordem:

1. **Reset de flags** (via migration SQL):
   ```sql
   UPDATE notas_imagens
   SET processada = false, normalizada = false, tentativas_finalizacao = 0
   WHERE id = '<NOTA_ID>';
   ```

2. **Invocar `process-receipt-full`** via `supabase--curl_edge_functions`:
   - `POST /process-receipt-full` com body `{"notaId":"<NOTA_ID>","force":true}`
   - Aguardar retorno completo (não disparar a próxima até confirmar)

3. **Validação imediata** da nota (query):
   ```sql
   SELECT id, processada, status_processamento, erro_mensagem,
          (SELECT COUNT(*) FROM estoque_app WHERE nota_id = ni.id) AS itens_inseridos,
          (SELECT COUNT(*) FROM estoque_app WHERE nota_id = ni.id AND preco_unitario_ultimo > 0) AS itens_com_preco
   FROM notas_imagens ni WHERE id = '<NOTA_ID>';
   ```

4. **Pausa de 3s** entre notas para evitar pressão no gateway.

5. Se uma nota falhar (timeout, erro 5xx, `processada` continua false), **pausar a sequência** e reportar antes de seguir para a próxima.

### Relatório final (após as 4 notas)

Rodar a mesma query consolidada do início:
- Total notas / processadas / pendentes
- Total de itens em `estoque_app`
- % com preço > 0
- Cobertura de `produto_master_id`
- Valor total recuperado
- Listar qualquer nota que ainda tenha ficado pendente

### Garantias
- ❌ **Nenhuma alteração em código** (Edge Functions, frontend, schema)
- ❌ **Nenhuma alteração nos 309 registros já criados** com sucesso
- ✅ Apenas reset de 3 flags em 4 notas + invocação da função já corrigida
- ✅ Estritamente sequencial (1 nota por vez, com validação entre cada uma)

### Observação sobre os build errors reportados
Os erros TypeScript listados na mensagem (`aplicar-normalizacao-retroativa`, `auto-fix-stuck-notes`, `consolidar-masters-*`, etc.) são **pré-existentes** e **não foram introduzidos** pelas correções da Fase 2.2 (que tocou apenas em `process-receipt-full/index.ts`). Eles não bloqueiam o reprocessamento. Se quiser que eu inclua a correção desses erros, posso propor isso em um plano separado depois — mas conforme sua instrução ("não alterar mais código neste momento"), eles ficam fora deste plano.