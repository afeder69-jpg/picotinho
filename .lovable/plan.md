

## Plano: Corrigir constraint `listas_compras_origem_check`

### Causa raiz confirmada
O constraint `listas_compras_origem_check` restringe `origem` a `['manual', 'receita', 'cardapio', 'whatsapp']`. O valor `'estoque'` é rejeitado pelo banco.

### Alteração necessária

**1 migration SQL:**

```sql
ALTER TABLE public.listas_compras
  DROP CONSTRAINT listas_compras_origem_check;

ALTER TABLE public.listas_compras
  ADD CONSTRAINT listas_compras_origem_check
  CHECK (origem IN ('manual', 'receita', 'cardapio', 'whatsapp', 'estoque'));
```

### O que NÃO muda
- Nenhum código frontend alterado
- Toast, desfazer, X, swipe, modal — tudo intacto
- Logs temporários permanecem para validação do fluxo completo

### Após a migration
O fluxo do carrinho deve funcionar de ponta a ponta:
1. Criar lista com `origem = 'estoque'` ✓
2. Inserir item ✓
3. Deduplicar se já existir ✓
4. Mostrar "👍 Na lista" ✓
5. Exibir "Caixa de Entrada" com ícone Inbox na tela de listas ✓

