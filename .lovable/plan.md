

## Plano: Adicionar card de Usuários Cadastrados no Dashboard de Normalização

### Situação atual

O `stats.totalUsuarios` já é carregado (linha 365-366) via `supabase.from('profiles').select('id')`, mas o valor **não é exibido** no grid de estatísticas do dashboard (linhas 1817-1955). O grid tem 6 cards em `grid-cols-2 md:grid-cols-3`, e o `totalUsuarios` nunca é renderizado.

Porém, a query atual (`select('id')` da tabela `profiles`) pode falhar com RLS ativa, pois o usuário master só vê seu próprio perfil. Já existe a função RPC `contar_usuarios_cadastrados()` com SECURITY DEFINER criada na migration anterior.

### Alterações

**Arquivo: `src/pages/admin/NormalizacaoGlobal.tsx`**

1. **Substituir a query de usuários** (linha 364-366): trocar `supabase.from('profiles').select('id')` por `supabase.rpc('contar_usuarios_cadastrados')` para garantir contagem global correta via SECURITY DEFINER.

2. **Adicionar card no grid** (após linha 1954, antes do fechamento do grid): novo card "Usuários Cadastrados" com ícone `Users`, exibindo `stats.totalUsuarios`, seguindo o mesmo padrão visual dos outros cards.

### Escopo

- 1 arquivo alterado: `src/pages/admin/NormalizacaoGlobal.tsx`
- Nenhuma migration (RPC já existe)
- Visível apenas para usuários master (a página inteira já tem essa proteção)

