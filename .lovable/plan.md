


## Correção: persistência de contexto estruturado para escolhas numeradas (IMPLEMENTADO)

### Problema
Quando o usuário escolhe uma opção numerada (ex: "1" para MAÇÃ GALA), a próxima invocação do assistente não tem acesso ao `produto_id` real retornado pela tool anterior — o histórico só contém texto. O LLM alucina um UUID, que é bloqueado pela validação pré-insert, gerando loop infinito de desambiguação.

### Mudanças aplicadas

| Local | Mudança |
|---|---|
| Schema | Coluna `opcoes_pendentes JSONB` em `whatsapp_preferencias_usuario` |
| Linhas 985-1040 | Detecção de escolha numérica (regex: "1", "opção 2", "a primeira", etc.) + resolução via snapshot + injeção de contexto com `produto_id` real |
| Linhas 1136-1148 | Injeção do contexto estruturado como mensagem de sistema antes da mensagem do usuário |
| Linhas 1235-1300 | Após tool retornar opções (buscar_produto_catalogo, resolver_item_por_historico, adicionar_itens_lista com desambiguação), salvar snapshot no banco |
| Limpeza | Snapshot limpo após uso, expiração (10min), ou mudança de assunto |

### Fluxo corrigido
1. Tool retorna múltiplas opções → snapshot salvo em `opcoes_pendentes`
2. Usuário responde "1" → snapshot lido, `produto_id` real resolvido
3. Contexto injetado: "O produto_id correspondente é [UUID]. Use este ID EXATO."
4. LLM chama `adicionar_itens_lista` com o ID real → insert bem-sucedido
5. Snapshot limpo

Nenhuma alteração de schema além da coluna. Arquivo único editado + deploy realizado.
