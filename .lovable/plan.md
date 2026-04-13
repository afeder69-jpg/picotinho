

## Plano: Liberar leitura de produtos master para todos os usuários autenticados

### Problema
A tabela `produtos_master_global` possui apenas uma política SELECT:
- **"Masters podem ver todos os produtos master"** → `has_role(auth.uid(), 'master')`

Usuários comuns autenticados não conseguem ler nenhum produto. A busca de ingredientes nas receitas retorna array vazio silenciosamente.

Funciona no seu celular porque você tem role `master`.

### Correção

Uma migration SQL adicionando uma política SELECT para todos os usuários autenticados:

```sql
CREATE POLICY "Usuarios autenticados podem ler produtos master ativos"
ON public.produtos_master_global
FOR SELECT
TO authenticated
USING (status = 'ativo');
```

Isso permite que qualquer usuário logado leia produtos com status `ativo`, sem expor produtos inativos ou em rascunho. As políticas de INSERT/UPDATE/DELETE continuam restritas a masters.

### O que NÃO muda
- Nenhuma Edge Function
- Nenhum componente frontend
- Permissões de escrita (continuam restritas a masters)
- Apenas uma nova política de leitura

### Resultado
Após a correção, todos os usuários autenticados verão os produtos na busca de ingredientes ao cadastrar receitas.

