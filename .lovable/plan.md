

# Hotfix de segurança — Remover policies permissivas de `receipts_public` e `receipt_items_public`

## Abordagem

Apenas remover as policies `USING (true)` existentes. Nenhuma nova policy de SELECT será criada. RLS continua habilitado, então:
- `anon` e `authenticated` ficam bloqueados por ausência de policy.
- `service_role` segue funcionando porque ignora RLS por padrão.

## Migration

```sql
DROP POLICY IF EXISTS "Allow public read access" ON public.receipts_public;
DROP POLICY IF EXISTS "Allow public read access" ON public.receipt_items_public;
```

Nenhum `CREATE POLICY` adicional. Sem alterar INSERT/UPDATE/DELETE (que já não têm policies). Sem mexer em outras tabelas.

## O que NÃO muda

- Frontend: zero alteração (nenhum consumo dessas tabelas).
- Edge functions: zero alteração (nenhum consumo).
- `types.ts`: regenerado automaticamente pelo Supabase.
- Outras tabelas: intocadas.

## Validação

1. `SELECT` com `anon` (REST + chave anônima) → retorna vazio/bloqueado.
2. `SELECT` com usuário autenticado comum → retorna vazio/bloqueado.
3. `SELECT` com `service_role` → preservado (bypass nativo de RLS).
4. Linter do Supabase deixa de reportar `receipts_public_cnpj_exposure`.
5. App segue 100% funcional — nenhuma tela depende dessas tabelas.

