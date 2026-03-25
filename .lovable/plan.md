

## Plano: Adicionar 'whatsapp' como origem válida em listas_compras

### Causa raiz

A tabela `listas_compras` possui um CHECK constraint (`listas_compras_origem_check`) que restringe o campo `origem` a valores como `manual`, `receita`, `cardapio`. O assistente do WhatsApp tenta criar listas com `origem = 'whatsapp'`, que é rejeitado pelo banco.

### Correção

Uma migration SQL para alterar o CHECK constraint, adicionando `'whatsapp'` como valor válido:

```sql
ALTER TABLE listas_compras DROP CONSTRAINT listas_compras_origem_check;
ALTER TABLE listas_compras ADD CONSTRAINT listas_compras_origem_check 
  CHECK (origem IN ('manual', 'receita', 'cardapio', 'whatsapp'));
```

### Escopo

- 1 migration SQL
- Nenhuma alteração no frontend ou na Edge Function
- O assistente já envia `origem = 'whatsapp'`, só precisa que o banco aceite

### Resultado esperado

Ao pedir "cria uma lista chamada Carnaval" pelo WhatsApp, a lista será criada sem erro.

