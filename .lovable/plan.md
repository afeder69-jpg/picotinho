## Modo de Acesso Restrito — Plano Final (com ajustes)

### 1. Migration

**Tabela `app_config`**
- `chave` text PK, `valor` jsonb, `updated_at` timestamptz
- Seed: `('acesso_restrito', 'true')`
- RLS: SELECT público; UPDATE/INSERT apenas role `master`

**Tabela `convites_acesso`**
- `id` uuid PK
- `codigo` text unique (8 chars alfanuméricos maiúsculos, formato `^[A-Z0-9]{8}$`)
- `email_destino` text nullable (se preenchido, signup precisa bater)
- `status` text NOT NULL default `'disponivel'` — enum check (`disponivel`, `reservado`, `usado`)
- `token_temp` text nullable
- `token_expira_em` timestamptz nullable
- `criado_por` uuid, `usado_por` uuid nullable, `usado_em` timestamptz nullable
- `expira_em` timestamptz nullable
- `created_at` timestamptz
- RLS: master-only; consumo via edge function (service_role)

**RPC `validar_codigo_convite(codigo text)`** — SECURITY DEFINER, retorna jsonb:
```
{ valido: bool, motivo: 'ok'|'inexistente'|'expirado'|'usado'|'reservado'|'formato_invalido' }
```

### 2. Edge function `consumir-convite` (verify_jwt = false)

Input: `{ codigo, email }`. Validações:
1. Formato do código (`^[A-Z0-9]{8}$`) e email (zod)
2. Rate limit básico em memória por IP (5 tentativas / 60s — ad-hoc, sem infra)
3. Busca convite (case-insensitive)
4. Checa status, expira_em, e se `email_destino` existir, exige match exato (lowercase)
5. Marca `status='reservado'`, gera `token_temp` (uuid), `token_expira_em = now() + 10min`
6. Retorna `{ ok, token_temp }`

Edge `confirmar-convite` (verify_jwt = true): valida token + user.email do JWT, marca `status='usado'`, `usado_por = user.id`.

### 3. Frontend

- `src/hooks/useAppConfig.ts` — lê flag (cache + React Query)
- `src/components/auth/RestrictedRouteGuard.tsx` — **whitelist explícita**: `['/', '/auth', '/reset-password', '/privacy', '/terms', '/data-deletion']`. Se `acessoRestrito && !user && !whitelist.includes(pathname)` → redirect `/auth`
- `src/App.tsx` — envolver `<Routes>` com guard
- `src/pages/Menu.tsx` — quando restrito + sem user, opções desabilitadas + toast "Você precisa estar logado para acessar"
- `src/pages/Auth.tsx` — aba Cadastrar:
  - Banner explicativo no topo: "🔒 Cadastros são por convite. Insira o código recebido para criar sua conta."
  - Campo "Código de convite" obrigatório
  - Fluxo: `consumir-convite` → `signUp` → `confirmar-convite`
  - Login intocado

### 4. Garantias
- Flag `false` → comportamento atual 100% preservado
- Login (email/Google/Facebook), reset de senha, usuários antigos: intocados
