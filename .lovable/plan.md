

## Correção: validação pré-insert com confirmação explícita do usuário

### Problema
O `produto_id` chega ao insert mas pode não existir em `produtos_master_global`, causando erro FK 23503. O sistema não valida antes de inserir, e o plano anterior propunha converter silenciosamente para item livre — o que mascara erro estrutural.

### Arquivo único: `supabase/functions/picotinho-assistant/index.ts`

### Mudança 1 — Validação pré-insert em `adicionar_itens_lista` (linhas 543-558)

Substituir o `.map()` simples por lógica assíncrona que, para cada item com `produto_id`:

1. **Valida existência** em `produtos_master_global`
2. **Se válido**: insere normalmente. Log: `origem: "id_validado"`
3. **Se inválido, re-resolve** via RPC `buscar_produtos_master_por_palavras` pelo `produto_nome`:
   - **1 match**: substitui pelo ID válido e insere. Log: `origem: "re_resolvido"`
   - **Múltiplos matches**: **não insere**. Retorna as opções para desambiguação ao assistente
   - **0 matches**: **não insere**. Retorna mensagem pedindo confirmação explícita ao usuário para adicionar como item livre

Itens sem `produto_id` e com `item_livre: true` explícito passam direto (comportamento atual mantido).

### Mudança 2 — Log estruturado com origem do fluxo (linhas 552-553)

Cada item logado com:
- `produto_id_original`: o ID recebido do LLM
- `produto_id_final`: o ID efetivamente usado (ou `null`)
- `origem_fluxo`: `catalogo`, `historico`, `opcao_numerada`, `texto_reconstruido` ou `desconhecida` — extraído de um campo opcional `origem` que o LLM pode enviar (se não enviar, registra `desconhecida`)
- `validacao`: `id_validado`, `re_resolvido`, `desambiguacao_necessaria`, `confirmacao_necessaria`

Formato:
```
📦 [insert] NESCAU 350G | id_original: abc | id_final: def | origem_fluxo: catalogo | validacao: re_resolvido
```

### Mudança 3 — Retorno diferenciado da tool

O retorno de `adicionar_itens_lista` passa a incluir:
- `itens_adicionados`: itens gravados com sucesso
- `itens_pendentes_desambiguacao`: itens que precisam de escolha do usuário (com opções)
- `itens_pendentes_confirmacao`: itens que precisam de confirmação para item livre

Isso permite ao LLM apresentar as perguntas corretas sem inventar fallback.

### Mudança 4 — Regra 18c no system prompt (após linha 940)

Adicionar instrução explícita:
> "18d. NUNCA converta automaticamente um item para item_livre por falha técnica de produto_id. Se o ID for inválido e a re-resolução não encontrar match único, pergunte ao usuário: apresente as opções encontradas (se múltiplas) ou pergunte se deseja adicionar como item livre (se nenhuma). Item livre só com confirmação explícita do usuário."

### Mudança 5 — Campo `origem` na definição da tool `adicionar_itens_lista`

Adicionar campo opcional `origem` (string) na descrição dos itens da tool, com valores possíveis: `catalogo`, `historico`, `opcao_numerada`. Isso permite rastrear de onde o LLM obteve o `produto_id`.

### Resumo

| Local | Mudança |
|---|---|
| Linhas 543-568 | Validação pré-insert + re-resolução + retorno diferenciado (sem fallback automático) |
| Linhas 552-553 | Log estruturado com `origem_fluxo` e `validacao` |
| Retorno da tool | Campos `itens_pendentes_desambiguacao` e `itens_pendentes_confirmacao` |
| Linha ~940 | Regra 18d: item livre só com confirmação explícita |
| Definição da tool | Campo opcional `origem` para rastreabilidade |

Nenhuma alteração de schema. Arquivo único editado.

