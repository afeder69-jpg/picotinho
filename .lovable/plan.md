# Fase 2 — Reconstrução do estoque (detalhamento completo)

## 1. Função/pipeline exato

**Edge Function**: `supabase/functions/process-receipt-full/index.ts`

É a **mesma função** usada hoje em produção quando você escaneia uma nota. Nada de função legada, nada de RPC antiga, nada de inserção manual no `estoque_app`.

Como será chamada: um script orquestrador (executado uma única vez) itera as 23 notas e para cada uma faz:

```
POST /functions/v1/process-receipt-full
body: { notaImagemId: <id_da_nota>, forceReprocess: true }
```

Antes de cada chamada o orquestrador faz `UPDATE notas_imagens SET processada=false, normalizada=false WHERE id=<id>` para que a função reprocesse limpo. O DELETE interno da função (linha 1431) é **escopado por `nota_id` + `user_id`** e passa pelo trigger de segurança porque fornece `OLD.nota_id` (regra autorizada na Fase 1).

Processamento sequencial (não paralelo) com pausa de 1s entre notas para não sobrecarregar APIs de normalização.

## 2. Uso do fluxo atual

Sim — `process-receipt-full` é exatamente o pipeline vigente. Para cada item da nota ele aplica, em ordem (memória `fluxo-identificacao-hierarquia-ia`):

1. **EAN** (`ean_comercial`): match direto em `produtos_master_global.codigo_barras` → vínculo imediato com `produto_master_id` e herda nome, categoria, imagem, SKU.
2. **Sinônimos / normalizações** (`normalizacoes_produtos`, `normalizacoes_marcas`, `normalizacoes_embalagens`).
3. **IA (Gemini via Lovable AI Gateway)** se `USE_AI_NORMALIZATION=true` (padrão atual).
4. **Fuzzy match** com thresholds 85% geral / 70% marca conhecida (memória `automatic-on-entry-logic-and-thresholds`).
5. **Categoria**: aplicada via regras canônicas das 11 categorias; fallback `OUTROS` (memórias `categorias-canonicas` e `categoria-obrigatoria-sistema`).
6. **`produto_master_id`**: preenchido quando confiança ≥ 90% (master existente) ou quando o item cria/atualiza um master.
7. Itens sem match suficiente entram com **`produto_candidato_id`** (provisório, indicador ⏳ no estoque) — comportamento padrão atual, não é regressão.
8. **Conversão para unidade base** (KG/L/UN) via `qtd_base` e `preco_por_unidade_base` (memória `conversao-embalagem-unidade-base`).
9. **Nome original preservado** em `produto_nome`, normalizado em `produto_nome_normalizado` (memória `product-name-preservation`).

Estabelecimento e preços: a função já dispara internamente a normalização do mercado (`normalizacoes_estabelecimentos`) e a atualização de `precos_atuais` por CNPJ + `produto_master_id` (memórias `market-normalization-and-visibility` e `integridade-vinculo-master-id`).

## 3. Consolidação / anti-duplicata

Três camadas, todas já existentes na função:

- **Dentro da mesma nota**: o bloco `produtosConsolidados = new Map()` (linha ~1447) agrupa itens duplicados pela descrição antes do INSERT — soma quantidades e mantém um único registro por produto na nota.
- **Entre notas (mesmo usuário)**: o estoque é consolidado por `produto_master_id` quando existente, ou por `produto_nome_normalizado + unidade_medida` quando provisório (memória `estoque/consolidation-logic`). Se o produto já existe no estoque, o pipeline **soma quantidades** em vez de criar novo registro.
- **Idempotência por nota**: o DELETE escopado em `nota_id + user_id` antes do INSERT garante que rodar a mesma nota duas vezes não duplica — apaga só os itens daquela nota e reinsere.

Como o estoque está em zero hoje, a primeira nota cria registros; as 22 seguintes vão consolidando contra os já criados pelo `produto_master_id` / chave normalizada.

## 4. Estimativa de itens reconstruídos

Dados confirmados via query agora:

- **23 notas** íntegras (`dados_extraidos IS NOT NULL`, `excluida=false`).
- **599 itens** somando todos os arrays JSON.
- Após consolidação por `produto_master_id` e por nome normalizado entre notas, a estimativa realista de **registros finais em `estoque_app`** fica entre **180 e 260 linhas** (compatível com seu histórico anterior de 533 antes da exclusão — a redução vem de consolidação correta; o histórico anterior provavelmente tinha alguma fragmentação por variantes que a normalização atual unifica).
- Distribuição por mercado das 23 notas: MEGABOX RECREIO (6), MUNDIAL RECREIO (3), ASSAI CESÁRIO DE MELO (2), COSTAZUL CESÁRIO DE MELO (2), SUPERMARKET A.VASCONCELOS (2), PREZUNIC BARRA (4), GUANABARA RECREIO (1), demais (3).
- Período coberto: **set/2025 a fev/2026**.

## 5. Validação pós-reconstrução

O orquestrador, ao final, gera um relatório consolidado validando:

1. **Notas reprocessadas com sucesso**: contar `processada=true AND normalizada=true` deve = 23. Qualquer falha vai para uma lista de "notas a reinvestigar" (não silencia erro).
2. **Cobertura de itens**: `SELECT SUM(jsonb_array_length(...)) FROM notas_imagens` (599) vs `SELECT COUNT(*) FROM estoque_app WHERE user_id=...`. Esperado: estoque ≤ 599 (consolidação é normal); alerta se < 100 (sub-processamento).
3. **Vínculos master**: % de itens com `produto_master_id NOT NULL` (esperado ≥ 60%) e % com `ean_comercial NOT NULL` (esperado ≥ 40%).
4. **Categorias**: nenhum item com `categoria` nula ou string vazia. Distribuição entre as 11 categorias canônicas (memória `categorias-canonicas`); contar quantos caíram em `OUTROS` (esperado < 15%).
5. **Preços**: `preco_unitario_ultimo > 0` em ≥ 95% dos registros; `preco_por_unidade_base > 0` quando `unidade_base` definida.
6. **Datas de compra**: `created_at` do registro de estoque deve refletir a `data_emissao` da nota (memória `data-integrity-purchase-date`); checagem por amostra.
7. **Sem duplicatas óbvias**: `GROUP BY produto_nome_normalizado, unidade_medida HAVING COUNT(*) > 1` deve retornar lista pequena (apenas casos legítimos de variantes).
8. **`precos_atuais` repovoada**: pelo menos 1 registro por par (CNPJ, `produto_master_id`) para os mercados das 23 notas.

O relatório é exibido em chat ao final, item por item, antes de você considerar concluído.

## O que será feito (resumo executável)

1. Criar script orquestrador one-shot (não fica no codebase como função recorrente).
2. Para cada uma das 23 notas: resetar flags → invocar `process-receipt-full` → aguardar resposta → registrar resultado.
3. Rodar as 8 validações acima.
4. Apresentar relatório completo no chat.

## O que NÃO será feito

- Não tocar em nenhuma das funções neutralizadas na Fase 1.
- Não usar nenhum legado (`recalcular_estoque_*`, `cleanup-*`, `limpar-*`).
- Não inserir diretamente em `estoque_app` por SQL — toda escrita passa por `process-receipt-full`.
- Não alterar `notas_imagens.dados_extraidos` (fonte de verdade preservada).
- Não rodar normalização global retroativa nem consolidação de masters — só o pipeline de ingestão.
- Não enviar nada ao WhatsApp nem disparar qualquer notificação.

## Tempo estimado de execução

~3 a 6 minutos (23 notas × ~10s/nota com pausa de 1s).

## Reversibilidade

Caso algo dê errado no meio: as notas continuam intactas em `notas_imagens`, basta reexecutar o orquestrador. Se preferir abortar tudo, basta executar `UPDATE estoque_app SET quantidade=0` (passa pelo trigger porque é UPDATE, não DELETE) — mas só faria isso sob sua ordem explícita.
