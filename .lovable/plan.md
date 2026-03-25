

## Correção: validação pré-insert com confirmação explícita do usuário (IMPLEMENTADO)

### Problema
O `produto_id` chega ao insert mas pode não existir em `produtos_master_global`, causando erro FK 23503.

### Mudanças aplicadas (`supabase/functions/picotinho-assistant/index.ts`)

| Local | Mudança |
|---|---|
| Tool definition (linha ~210) | Campo opcional `origem` adicionado para rastreabilidade |
| `adicionar_itens_lista` (linhas 539-680) | Validação pré-insert completa: verifica existência do ID, re-resolve via RPC se inválido, retorna desambiguação ou pedido de confirmação |
| System prompt (regra 18c/d) | Item livre só com confirmação explícita do usuário; regra 18d proíbe fallback automático |
| Logs | Formato estruturado: `id_original`, `id_final`, `origem_fluxo`, `validacao` |

### Retorno diferenciado da tool
- `itens_adicionados`: itens gravados com sucesso
- `itens_pendentes_desambiguacao`: itens com múltiplos matches (opções para o usuário)
- `itens_pendentes_confirmacao`: itens sem match (aguardam confirmação para item livre)
- `avisos`: correções automáticas aplicadas (re-resolução de ID)

Nenhuma alteração de schema. Arquivo único editado. Deploy realizado.
