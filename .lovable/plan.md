

## Correção: integração entre busca no catálogo e gravação na lista

### Problema raiz

O campo retornado por `buscar_produto_catalogo` é `produto_master_id` (linha 722), mas `adicionar_itens_lista` espera `produto_id` (linha 549). Quando o LLM recebe `produto_master_id` da busca e tenta passá-lo para a inserção, o campo não é reconhecido e o item é gravado sem vínculo estrutural.

O system prompt na regra 18b reforça o nome errado ("use o produto_master_id diretamente"), agravando o problema.

### Mudanças (arquivo único: `supabase/functions/picotinho-assistant/index.ts`)

**1. Renomear campo de saída do catálogo (linha 722)**
- De: `produto_master_id: p.id`
- Para: `produto_id: p.id`

**2. Atualizar descrição da tool (linha 277)**
- De: "Retorna produto_master_id"
- Para: "Retorna produto_id"

**3. Enriquecer `resolver_item_por_historico` com `produto_id`**
- Após encontrar produtos no histórico, tentar resolver cada um via RPC `buscar_produtos_master_por_palavras`
- Se encontrar match único, incluir `produto_id` no resultado
- Isso permite que itens do histórico também sejam adicionados como estruturados

**4. Corrigir system prompt — regra 18b (linha 917)**
- De: "use o produto_master_id diretamente"
- Para: "use o produto_id retornado diretamente no campo produto_id de adicionar_itens_lista"

**5. Reforçar no prompt: preservar identificador ao escolher opção numerada**
- Adicionar instrução explícita: quando o usuário responde com um número (ex: "1"), o assistente deve reutilizar o `produto_id` da opção correspondente, e não apenas o texto exibido

**6. Adicionar log de debug no insert (linhas 543-556)**
- Antes do insert em `listas_compras_itens`, logar o payload completo para diagnóstico futuro

### Resumo

| Local | Mudança |
|---|---|
| Linha 722 | `produto_master_id` → `produto_id` na saída do catálogo |
| Linha 277 | Descrição da tool atualizada |
| Linhas 625-656 | `resolver_item_por_historico` tenta resolver `produto_id` via RPC |
| Linha 917 | Regra 18b corrigida no prompt |
| Regra nova | Instrução para preservar `produto_id` ao escolher opção numerada |
| Linhas 543-556 | Log de payload antes do insert |

Nenhuma alteração de schema. Arquivo único editado.

