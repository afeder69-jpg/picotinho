

## Plano: Excluir 3 campanhas travadas

### O que sera feito

Uma migration SQL para deletar as 3 campanhas com status "enviando" que travaram e nunca enviaram nada:

- `a64bf808-9a00-4057-a972-cf524e897521` (criada 23:49)
- `7094ec57-54d3-4086-9ec1-c9ab48980cd7` (criada 23:48)
- `4840b5cc-e54e-49d8-99f5-fb69de23793e` (criada 23:48)

Todas com 0 destinatarios, 0 enviados, 0 falhas. Sem registros relacionados em `campanhas_whatsapp_envios` nem `campanhas_whatsapp_disparos`.

### O que permanece

As duas campanhas concluidas com sucesso:
- "A Picanha do Lula" (3/3 enviados)
- "Novidade no Picotinho" (3/3 enviados)

### Implementacao

**Arquivo unico: nova migration SQL**

```sql
DELETE FROM campanhas_whatsapp
WHERE id IN (
  'a64bf808-9a00-4057-a972-cf524e897521',
  '7094ec57-54d3-4086-9ec1-c9ab48980cd7',
  '4840b5cc-e54e-49d8-99f5-fb69de23793e'
)
AND status = 'enviando';
```

A condicao `AND status = 'enviando'` e uma protecao extra para garantir que so deleta se ainda estiverem no estado travado.

