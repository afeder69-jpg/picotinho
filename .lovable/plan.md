

## Correção: persistência de contexto estruturado para escolhas numeradas

### Justificativa: por que `whatsapp_preferencias_usuario` e não outra tabela

**Alternativas consideradas:**

1. **`whatsapp_mensagens` (campo existente `parametros_comando`)** — Não serve. Cada invocação do assistente é uma mensagem nova. Quando o usuário responde "1", é uma mensagem diferente da que continha as opções. Seria necessário buscar a mensagem anterior que continha opções, mas não há campo que identifique "esta mensagem tem opções pendentes". Adicionar isso seria equivalente a criar estado conversacional na tabela de mensagens — inadequado semanticamente.

2. **Nova tabela dedicada (ex: `whatsapp_estado_conversa`)** — Possível, mas overkill. O estado é 1 registro por usuário, transitório, com expiração. Criar tabela só para isso adiciona complexidade sem benefício.

3. **`whatsapp_preferencias_usuario` (coluna nova `opcoes_pendentes`)** — **Melhor opção**. Já é o local canônico de estado conversacional do usuário (contém `lista_ativa_id`, `nome_preferido`). Já é carregada a cada invocação (linha 979). Adicionar `opcoes_pendentes JSONB` é natural e não requer join extra. O snapshot é transitório e será limpo após uso ou expiração.

### Mudanças

**1. Schema — nova coluna em `whatsapp_preferencias_usuario`**

```sql
ALTER TABLE whatsapp_preferencias_usuario 
ADD COLUMN opcoes_pendentes JSONB DEFAULT NULL;
```

Formato do snapshot:
```json
{
  "timestamp": "2026-03-25T15:15:47Z",
  "contexto": "adicionar_item_lista",
  "lista_id": "53dfa5c3-...",
  "opcoes": [
    { "numero": 1, "produto_id": "1cf39628-...", "nome": "MAÇÃ GALA" },
    { "numero": 2, "produto_id": "e633575c-...", "nome": "Maça Carioca kg" }
  ]
}
```

**2. Salvar snapshot após apresentar opções (`picotinho-assistant/index.ts`)**

Após a tool `buscar_produto_catalogo` retornar múltiplos resultados (linha 855-870), **e** após a tool `adicionar_itens_lista` retornar `itens_pendentes_desambiguacao` (linhas 677-680):

- Detectar no retorno da tool que há opções para o usuário
- Salvar snapshot em `whatsapp_preferencias_usuario.opcoes_pendentes`
- O salvamento acontece no loop de processamento de tool calls (após linha 1170), não dentro da tool

**3. Resolver escolha numérica antes de chamar o LLM (antes da linha 1085)**

Antes de montar o array `messages` para enviar ao LLM:

1. Verificar se `preferencias?.opcoes_pendentes` existe
2. Verificar se a mensagem do usuário é uma escolha numérica (regex: `/^\s*(?:opção\s*)?(\d+)\s*$/i` ou variantes como "a primeira", "quero a 1", "número 2")
3. Se ambas as condições forem verdadeiras:
   - Mapear o número para o `produto_id` real do snapshot
   - Injetar mensagem de sistema no contexto: `"O usuário escolheu a opção N. O produto_id correspondente é [UUID]. O nome do produto é [NOME]. Use este produto_id exato ao chamar adicionar_itens_lista. O contexto da ação é: [contexto do snapshot, ex: adicionar_item_lista na lista X]."`
   - Limpar `opcoes_pendentes` no banco (set null)
4. Se o número escolhido estiver fora do range das opções: informar ao usuário

**Regex de detecção de escolha numerada:**
```typescript
const matchEscolha = conteudo.match(
  /^\s*(?:(?:opção|opcao|número|numero|a|quero\s+(?:a|o)?)\s*)?(\d+)\s*$/i
) || conteudo.match(
  /^\s*(?:a\s+)?primeir[ao]\s*$/i  // "a primeira" → 1
) || conteudo.match(
  /^\s*(?:a\s+)?segund[ao]\s*$/i   // "a segunda" → 2
) || conteudo.match(
  /^\s*(?:a\s+)?terceir[ao]\s*$/i  // "a terceira" → 3
);
```

**4. Expiração automática do snapshot**

Antes de usar o snapshot, verificar se `timestamp` tem menos de 10 minutos. Se expirado, limpar e não usar — o assistente seguirá o fluxo normal sem contexto extra.

Após qualquer mensagem processada que **não** seja uma escolha numérica válida (ou seja, o usuário mudou de assunto), limpar `opcoes_pendentes` para não contaminar interações futuras.

**5. Salvar snapshot também na desambiguação da validação pré-insert**

Quando `adicionar_itens_lista` retorna `itens_pendentes_desambiguacao`, o loop de processamento de tools (linha 1170) deve detectar isso no resultado e salvar automaticamente o snapshot com as opções retornadas.

### Resumo

| Local | Mudança |
|---|---|
| Schema | Coluna `opcoes_pendentes JSONB` em `whatsapp_preferencias_usuario` |
| Linhas 1085-1089 | Detecção de escolha numérica + injeção de contexto com `produto_id` real |
| Linhas 1170-1183 | Após tool retornar opções, salvar snapshot no banco |
| Linhas 978-983 | Carregar `opcoes_pendentes` junto com preferências (já acontece com `select('*')`) |
| Limpeza | Limpar snapshot após uso, expiração (10min), ou mudança de assunto |

Arquivo editado: `supabase/functions/picotinho-assistant/index.ts` + 1 migração de schema.

