# Bloqueio Total de Cadastro no Modo Restrito + Painel de Controle

## Objetivo

Com `app_config.acesso_restrito = true`, **nenhum** usuário novo entra no sistema sem convite válido — independente do provider (email, Google, Facebook). E dar ao master controle direto sobre essa flag, com reautenticação.

---

## Parte 1 — Trigger de Bloqueio em `auth.users` (camada autoritativa)

Migration nova com função `public.enforce_invite_on_signup()` `SECURITY DEFINER` + trigger `BEFORE INSERT ON auth.users`.

**Lógica:**

1. Lê `acesso_restrito` de `app_config`. Se `false` → permite (early return).
2. Se `true`, identifica provider em `NEW.raw_app_meta_data->>'provider'`.
3. Busca em `convites_acesso` um convite ligado ao e-mail `lower(NEW.email)`:
   - **Para `email`**: aceita convite com `status = 'reservado'` E `token_expira_em > now()` E `email_destino = lower(NEW.email)`. Esse é o estado deixado pelo `consumir-convite` momentos antes do `signUp`.
   - **Para `google` / `facebook` / outros OAuth**: aceita convite com `status IN ('disponivel','reservado')` E `email_destino = lower(NEW.email)` E (sem `token_expira_em` OU `token_expira_em > now()` no caso de reservado) E (sem `expira_em` global OU `expira_em > now()`).
4. Se **nenhum** convite válido → `RAISE EXCEPTION 'PICOTINHO_NO_INVITE: cadastro restrito a usuários convidados'`.

**Trigger `AFTER INSERT ON auth.users`** (`public.mark_invite_used_after_signup`) — só age quando `acesso_restrito = true` E provider é OAuth (não email):
- Marca o convite (`email_destino = NEW.email`, `status IN ('disponivel','reservado')`) como `usado`, `usado_por = NEW.id`, `usado_em = now()`, limpa `token_temp`.
- Para provider `email`, **não toca** no convite — o fluxo existente (`confirmar-convite` chamado pós-login) continua dono dessa transição. Isso evita conflito com o que já está em produção.

**Garantias:**
- Usuário antigo (já em `auth.users`) → trigger não dispara, login intacto.
- `acesso_restrito = false` → early return, comportamento atual liberado.
- Cadastro por e-mail com convite válido → `consumir-convite` reserva → `signUp` passa pelo trigger (encontra reservado) → fluxo atual segue.
- Cadastro por e-mail SEM passar pelo `consumir-convite` (ex: chamada direta da API) → bloqueado.
- OAuth novo sem convite → bloqueado.
- OAuth novo com convite emitido → permitido, convite vira `usado`.

---

## Parte 2 — Cleanup no Frontend (defesa em profundidade)

`src/components/auth/AuthProvider.tsx`: no `onAuthStateChange`, evento `SIGNED_IN`:

- Se `acesso_restrito = true` E provider OAuth E o usuário **não tem** convite `usado` ligado a ele (`usado_por = user.id` OU `email_destino = user.email`):
  - `signOut()` imediato.
  - Toast: *"Cadastro restrito. É necessário um convite para acessar o Picotinho."*
  - Redirect para `/auth`.

Cobre edge cases (sessão antiga, falha de trigger, OAuth criado antes do bloqueio).

`src/pages/Auth.tsx`:
- Quando `acesso_restrito` true, mostrar nota discreta sob os botões sociais: *"Login social disponível apenas para usuários convidados."*
- Tratar erro do `signUp` por e-mail: se mensagem contém `PICOTINHO_NO_INVITE` ou `database error` em modo restrito, exibir toast claro de "convite obrigatório".

---

## Parte 3 — Painel "Controle de Acesso" para Master

### Backend: edge function nova `toggle-acesso-restrito`

`supabase/functions/toggle-acesso-restrito/index.ts` (com `verify_jwt = true` em `config.toml`):

1. Valida JWT via `requireMaster` (já existe em `_shared/auth.ts`).
2. Body: `{ novo_valor: boolean, senha: string }`.
3. **Reautentica**: chama `supabase.auth.signInWithPassword({ email: ctx.email, password: senha })` usando client anônimo. Se falhar → 401 `senha_invalida`.
4. Lê `valor` atual de `app_config` onde `chave = 'acesso_restrito'`.
5. Faz `UPDATE app_config SET valor = novo_valor WHERE chave = 'acesso_restrito'`.
6. Insere log em nova tabela `acesso_restrito_log`: `{ alterado_por, email, valor_anterior, valor_novo, alterado_em }`.
7. Retorna `{ ok: true, valor_atual: novo_valor }`.

### Migration adicional

```sql
CREATE TABLE public.acesso_restrito_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alterado_por uuid NOT NULL REFERENCES auth.users(id),
  email text,
  valor_anterior boolean NOT NULL,
  valor_novo boolean NOT NULL,
  alterado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.acesso_restrito_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Masters podem ver logs"
  ON public.acesso_restrito_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'master'));
-- INSERT só via service_role (edge function).
```

### Frontend: nova página `src/pages/admin/ControleAcesso.tsx`

- Rota `/admin/controle-acesso` registrada em `App.tsx`.
- Link na área master/menu admin (mesmo lugar onde está `/admin/convites`), visível só para `has_role('master')`.
- Conteúdo:
  - **Status atual** com badge: "🔒 Acesso Restrito ATIVO" ou "🔓 Acesso Liberado".
  - Texto explicativo curto do que significa cada estado.
  - Botão "Desativar restrição" / "Ativar restrição" conforme estado.
  - Ao clicar, abre `AlertDialog` de confirmação com:
    - Texto explicando consequência.
    - Campo `Input type="password"` "Confirme sua senha".
    - Botões "Cancelar" / "Confirmar alteração".
  - "Confirmar" chama `supabase.functions.invoke('toggle-acesso-restrito', { body: { novo_valor, senha } })`.
  - Em caso de sucesso: toast verde + `queryClient.invalidateQueries(['app_config'])` para refletir em todo o app.
  - Em caso de senha inválida: toast vermelho específico, dialog permanece aberto.
  - Tabela "Histórico de alterações" mostrando últimos 20 registros de `acesso_restrito_log` (data, e-mail, anterior → novo).

### Proteção da rota

Wrapper que verifica role master no client (UX) — proteção real é a RLS + JWT da edge function.

---

## Arquivos Tocados

**Migrations:**
- `<ts>_oauth_invite_gate.sql` — funções e triggers em `auth.users`.
- `<ts>_acesso_restrito_log.sql` — tabela de log + RLS.

**Edge functions:**
- `supabase/functions/toggle-acesso-restrito/index.ts` (novo).
- `supabase/config.toml` — registrar `verify_jwt = true` para a nova função.

**Frontend:**
- `src/components/auth/AuthProvider.tsx` — cleanup OAuth pós-`SIGNED_IN`.
- `src/pages/Auth.tsx` — aviso sob botões sociais + tratamento `PICOTINHO_NO_INVITE`.
- `src/pages/admin/ControleAcesso.tsx` (novo).
- `src/App.tsx` — rota `/admin/controle-acesso`.
- `src/pages/admin/Convites.tsx` ou Menu admin — link para "Controle de Acesso".

---

## O Que NÃO Muda

- Login por e-mail/senha de usuários existentes.
- Login Google/Facebook de usuários já existentes.
- Fluxo de cadastro por convite (e-mail/senha) já implementado.
- Edge functions `consumir-convite`, `confirmar-convite`, `liberar-convite`.
- Comportamento com `acesso_restrito = false`.

---

## Critério de Aceitação

Com `acesso_restrito = true`:
1. Cadastro por e-mail SEM passar pelo fluxo de convite → bloqueado pelo trigger.
2. Cadastro por e-mail COM convite reservado pelo `consumir-convite` → funciona.
3. Google/Facebook novo sem convite → bloqueado, sem usuário criado, toast claro.
4. Google/Facebook novo com convite emitido para o e-mail → entra, convite vira `usado`.
5. Login de qualquer usuário antigo → funciona normalmente.
6. Master acessa `/admin/controle-acesso`, vê status, alterna com confirmação + senha, log é gravado.
7. Não-master que tente acessar a rota ou chamar a edge function → 403.

Posso aplicar?
