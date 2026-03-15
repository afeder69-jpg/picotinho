

# Fix: Erro "duplicate key value violates unique constraint" ao editar produto master

## Problema

Ao editar um produto master existente na tela de Normalização Global, o sistema tenta atualizar o campo `sku_global` junto com os demais dados. Se o valor do SKU no formulário coincidir com um SKU já existente em outro produto, o banco rejeita a operação por violação da constraint UNIQUE em `produtos_master_global.sku_global`.

## Causa Raiz

Na função `salvarEdicaoProdutoMaster()` (linha 1534 de `NormalizacaoGlobal.tsx`), o `updateData` inclui `sku_global: editForm.sku_global`. Isso é desnecessário e perigoso para edições — o SKU é um identificador que não deve mudar após a criação.

## Solução

Remover `sku_global` do objeto `updateData` na função `salvarEdicaoProdutoMaster()`. O SKU só deve ser definido na criação do produto (que já funciona corretamente). Ao editar, os demais campos (nome, categoria, marca, embalagem, etc.) continuam sendo atualizados normalmente.

**Arquivo:** `src/pages/admin/NormalizacaoGlobal.tsx`
**Alteração:** Remover a linha `sku_global: editForm.sku_global` do updateData (linha 1534). Opcionalmente, desabilitar o campo SKU no formulário de edição para que o usuário saiba que não é editável.

Nenhuma outra alteração necessária. Nenhuma migration. Nenhum outro arquivo afetado.

