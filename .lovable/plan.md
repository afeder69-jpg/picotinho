

## Diagnóstico: Consolidação de duplicatas não persiste

### Causa raiz

A tabela `precos_atuais` tem uma foreign key (`produto_master_id`) que referencia `produtos_master_global(id)` **sem cláusula ON DELETE** — o que significa `RESTRICT` por padrão. Quando a edge function `consolidar-masters-manual` tenta deletar o produto duplicado, o banco **bloqueia a exclusão** porque existem registros em `precos_atuais` apontando para ele. O erro é capturado no log mas a função retorna `sucesso: true`, dando a impressão de que funcionou.

Adicionalmente, a tabela `produtos_candidatos_normalizacao.sugestao_produto_master` também tem FK sem ON DELETE explícito (default RESTRICT), e a edge function atualiza apenas os candidatos que apontam para o duplicado — mas se houver algum que não foi atualizado, o delete também falha.

### Correções necessárias

**1. Migration: alterar FK de `precos_atuais` para `ON DELETE SET NULL`**

Consistente com o padrão já usado em `estoque_app` e `listas_compras_itens`.

```sql
ALTER TABLE public.precos_atuais
  DROP CONSTRAINT IF EXISTS precos_atuais_produto_master_id_fkey,
  ADD CONSTRAINT precos_atuais_produto_master_id_fkey
    FOREIGN KEY (produto_master_id)
    REFERENCES public.produtos_master_global(id)
    ON DELETE SET NULL;

ALTER TABLE public.produtos_candidatos_normalizacao
  DROP CONSTRAINT IF EXISTS produtos_candidatos_normalizacao_sugestao_produto_master_fkey,
  ADD CONSTRAINT produtos_candidatos_normalizacao_sugestao_produto_master_fkey
    FOREIGN KEY (sugestao_produto_master)
    REFERENCES public.produtos_master_global(id)
    ON DELETE SET NULL;
```

**2. Edge function `consolidar-masters-manual`: atualizar `precos_atuais` antes de deletar**

Adicionar um passo (entre o passo 3 e 4) que atualiza os registros em `precos_atuais` que apontam para o produto duplicado, redirecionando-os para o produto mantido — antes de tentar o DELETE. Isso garante que mesmo com a FK antiga, os dados são preservados corretamente.

```typescript
// 3.5 Atualizar referências em precos_atuais
const { count: countPrecos } = await supabase
  .from('precos_atuais')
  .update({ produto_master_id: produtoMantido.id })
  .eq('produto_master_id', produtoRemover.id)
  .select('*', { count: 'exact', head: true });
```

**3. Edge function: tratar erro de DELETE como falha real**

Atualmente, se o delete falha, a função retorna sucesso. Modificar para que o erro de delete seja propagado como falha do grupo, impedindo o toast "consolidado" falso.

### Escopo

- 1 migration (alterar 2 FKs)
- 1 edge function editada: `consolidar-masters-manual/index.ts`
- Nenhuma alteração no frontend

