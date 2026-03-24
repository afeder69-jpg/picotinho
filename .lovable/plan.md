

## Correção do ajuste de estoque para produtos consolidados

### Validação de segurança

Confirmado que zerar registros secundários é seguro:

- **Histórico de consumo** (`consumos_app`): referencia `produto_id` = ID do registro principal, que será mantido e atualizado. Sem impacto.
- **Notas fiscais**: campo `nota_id` nos registros permanece intacto — não é alterado nem deletado. Rastreabilidade preservada.
- **Reprocessamento de notas**: a função `process-receipt-full` deleta e recria todos os itens de uma nota ao reprocessar. Registros zerados não interferem.
- **WhatsApp / edge functions**: buscam por `user_id` + nome do produto. A consolidação visual no frontend já agrupa — os registros zerados simplesmente não contribuem para a soma.
- **Trigger `reverter_estoque_nota_excluida`**: opera por `nota_id`, independente da quantidade. Sem conflito.
- **Registros não são deletados** — apenas têm quantidade zerada. Toda metadata (produto_master_id, sku_global, nota_id, preços) permanece intacta para auditoria.

### Alteração

**1 arquivo**: `src/pages/EstoqueAtual.tsx` — função `salvarAjuste` (linhas 1299-1352)

Substituir o update único por:

1. Obter `ids_originais` do item consolidado (fallback para `[itemEditando.id]` se não consolidado)
2. Atualizar o **primeiro ID** com a nova quantidade
3. Zerar a quantidade dos **demais IDs** do grupo
4. Manter o registro de consumo existente (usando `quantidadeAnterior` que já reflete o total consolidado)
5. Manter toast, reload e tratamento de erro inalterados

```typescript
const idsOriginais = itemEditando.ids_originais || [itemEditando.id];
const idPrincipal = idsOriginais[0];
const idsSecundarios = idsOriginais.slice(1);

// Update principal
await supabase.from('estoque_app')
  .update({ quantidade: novaQuantidade, updated_at: new Date().toISOString() })
  .eq('id', idPrincipal);

// Zerar secundários
if (idsSecundarios.length > 0) {
  await supabase.from('estoque_app')
    .update({ quantidade: 0, updated_at: new Date().toISOString() })
    .in('id', idsSecundarios);
}
```

