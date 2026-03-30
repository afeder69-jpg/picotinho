

## Plano: Adicionar card "Total de Notas" no Dashboard de Normalização

### Situação atual

O dashboard já tem 7 cards no grid. Precisa de um 8o card mostrando o total de notas lançadas por todos os usuários. A tabela `notas_imagens` tem RLS por `usuario_id`, então uma contagem direta retornaria apenas as notas do master.

### Alterações

**1. Migration: criar RPC `contar_notas_sistema`**

Função `SECURITY DEFINER` que conta todas as linhas da tabela `notas_imagens` (independente de RLS), similar à já existente `contar_usuarios_cadastrados`.

```sql
CREATE OR REPLACE FUNCTION public.contar_notas_sistema()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::integer FROM notas_imagens;
$$;
```

**2. Frontend: `src/pages/admin/NormalizacaoGlobal.tsx`**

- Adicionar `totalNotas: 0` ao estado `stats` (linha 105)
- Na função `carregarDados`, chamar `supabase.rpc('contar_notas_sistema')` e atribuir ao stats (junto com a query de usuários, linha ~365)
- Adicionar novo card no grid (após o card de Usuários, linha ~1975) com ícone `FileText`, cor violet/purple, exibindo `stats.totalNotas` e subtítulo "notas lançadas"

### Escopo

- 1 migration (nova RPC)
- 1 arquivo alterado: `NormalizacaoGlobal.tsx`
- Atualiza dinamicamente a cada vez que o dashboard é carregado

