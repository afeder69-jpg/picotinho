

## Diagnóstico: Login com Google redirecionando para localhost

### Causa raiz identificada

Os **logs de autenticação do Supabase** confirmam o problema de forma objetiva:

```text
"referer": "http://localhost:3000"   ← em TODAS as requisições /authorize e /callback
```

Isso significa que o **Site URL no Supabase Auth ainda está configurado como `http://localhost:3000`**.

### Por que isso causa o erro

O fluxo OAuth funciona assim:

```text
1. Usuário clica "Entrar com Google" em picotinho.com.br
2. Frontend envia redirectTo: "https://picotinho.com.br/" (via window.location.origin)
3. Supabase redireciona para Google → usuário autentica
4. Google retorna para https://mjsbwrtegorjxcepvrik.supabase.co/auth/v1/callback
5. Supabase processa o callback e redireciona o usuário para...
   → Se "https://picotinho.com.br" NÃO está na lista de Redirect URLs permitidas,
     o Supabase IGNORA o redirectTo e usa o Site URL como fallback
   → Site URL = http://localhost:3000 → ERRO: "conexão com localhost recusada"
```

### O que precisa ser corrigido

**Nenhuma alteração no código** — o frontend já usa `window.location.origin` dinamicamente e não tem nenhuma referência a localhost. O problema é 100% configuração no painel do Supabase.

### Ações necessárias (todas no Supabase Dashboard)

**1. Supabase → Authentication → URL Configuration → Site URL**
- Alterar de `http://localhost:3000` para `https://picotinho.com.br`

**2. Supabase → Authentication → URL Configuration → Redirect URLs**
- Adicionar: `https://picotinho.com.br/**`
- Adicionar: `https://www.picotinho.com.br/**`
- Adicionar: `https://picotinho.lovable.app/**`
- Manter: `picotinho://auth/callback` (usado pelo app nativo)
- Remover ou manter `http://localhost:3000/**` apenas se ainda for necessário para desenvolvimento local

**3. Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client ID**
- Em **Authorized JavaScript origins**, adicionar:
  - `https://picotinho.com.br`
  - `https://www.picotinho.com.br`
- Em **Authorized redirect URIs**, confirmar que existe:
  - `https://mjsbwrtegorjxcepvrik.supabase.co/auth/v1/callback`

### Evidências

| Aspecto | Status |
|---|---|
| Código frontend (Auth.tsx) | Correto — usa `window.location.origin` |
| Código AuthProvider | Correto — sem referências a localhost |
| Supabase client config | Correto — flowType PKCE, detectSessionInUrl true |
| Auth logs do Supabase | Referer = `http://localhost:3000` em todas as requisições |
| Busca por "localhost" no código | Zero resultados |

### O que NÃO será alterado
- Nenhum arquivo do projeto
- Nenhuma edge function
- Nenhuma migration
- Fluxo nativo (deep link) permanece intacto

