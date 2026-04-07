

## Correcao: Multi-item Parsing, Busca Inteligente e Trava de Plausibilidade

### Arquivo alterado

`supabase/functions/picotinho-assistant/index.ts` (unico)

---

### Parte 1: Reforco no System Prompt — Segmentacao de Multi-itens

Adicionar regras 57-58 apos as existentes:

- **Regra 57**: Segmentacao obrigatoria de multiplos itens em mensagem unica. Cada item isolado com nome, quantidade e unidade independentes. Exemplo explicito no prompt mostrando que "500 gramas" = 0.5 KG, nunca 500 KG.
- **Regra 58**: Validacao pre-envio de unidade/quantidade. Nunca enviar novo_saldo >= 100 KG para item domestico sem perguntar. Regra de plausibilidade explicita.

~20 linhas adicionadas ao system prompt.

---

### Parte 2: Busca Inteligente por Nucleo do Produto (server-side)

No case `ajustar_saldo_estoque`, apos `ilike` retornar 0 resultados, fallback por palavras-chave:

1. Extrair palavras do produto_nome (minimo 2 caracteres)
2. Buscar todos os itens do estoque do usuario
3. Filtrar itens cujo nome normalizado contem TODAS as palavras-chave
4. 1 grupo consolidado → match unico (mesmas regras de seguranca)
5. Multiplos grupos → ambiguo
6. 0 → nao encontrado

Resolve: "banana prata", "suco de caju", "isotônico", "xarope de guaramcamp".

~30 linhas.

---

### Parte 3: Trava de Plausibilidade (server-side)

Validacao ANTES de executar update:

- KG: novo_saldo > 50 → **bloquear**, retornar como `pendente`
- L: novo_saldo > 50 → **bloquear**
- UN: novo_saldo > 200 → **bloquear**
- G: novo_saldo > 50000 → **bloquear**
- ML: novo_saldo > 50000 → **bloquear**

Motivo retornado: "Quantidade X unidade parece muito alta para uso domestico. Confirme o valor correto."

~15 linhas.

---

### Parte 4: Deteccao de Unidade Possivelmente Errada (server-side) — SEM CORRECAO AUTOMATICA

Quando o valor recebido apresentar indicio de unidade errada (ex: `novo_saldo: 500, unidade: "KG"`):

- **Bloquear a gravacao** — item vai para `itens_pendentes`
- **Retornar sugestao** no motivo, ex: "O valor 500 KG parece incompativel. Talvez o usuario quisesse dizer 500 g = 0,5 kg. Confirme o valor correto."
- **Nunca converter e gravar automaticamente**

Diferenca da versao anterior: antes havia auto-correcao silenciosa. Agora o comportamento e identico ao da trava de plausibilidade — bloqueia e pergunta.

~10 linhas.

---

### Resumo

| Parte | O que faz | Linhas |
|-------|-----------|--------|
| 1 | Regras 57-58 no system prompt | ~20 |
| 2 | Fallback busca por palavras-chave | ~30 |
| 3 | Trava de plausibilidade | ~15 |
| 4 | Deteccao unidade errada → bloquear + sugerir | ~10 |

Total: ~75 linhas novas. Zero removidas. Zero impacto em fluxos existentes.

