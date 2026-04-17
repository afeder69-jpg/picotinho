
Objetivo: corrigir a falha global de login no Picotinho para web e APK, cobrindo e-mail/senha e Google, sem assumir que o problema é de uma conta específica.

1. Confirmar a causa real antes de mexer
- Verificar os logs/autenticação no Supabase para separar dois cenários:
  - backend rejeitando todo mundo;
  - frontend quebrando o fluxo antes/depois do auth.
- Conferir a configuração de Auth no Supabase:
  - Site URL
  - Redirect URLs
  - provider Google
  - callback do APK (`picotinho://auth/callback`)

2. Corrigir a fragilidade principal encontrada no código
- Remover a limpeza agressiva de `localStorage` e `sessionStorage` em `src/App.tsx`.
- Substituir por invalidação cirúrgica só de cache da aplicação, preservando as chaves de autenticação do Supabase e o estado PKCE do OAuth.
- Isso é hoje o maior suspeito para quebrar login/retorno do Google de forma ampla após deploy.

3. Unificar o bootstrap de autenticação
- Deixar `AuthProvider` como única fonte de verdade para sessão.
- Parar de duplicar `getSession()` + `onAuthStateChange()` na página `Auth.tsx`.
- Adicionar um estado explícito de “auth pronto” para a UI só agir depois da restauração da sessão terminar.
- Evitar redirecionamentos prematuros e condições de corrida entre `AuthProvider` e `Auth.tsx`.

4. Endurecer o login por Google
- Ajustar o botão para não “parecer inabilitado” por estado global único de loading.
- Separar loading de login por senha e loading de OAuth.
- Garantir que o fluxo web use redirect consistente com o domínio atual e que o fluxo nativo mantenha o deep link correto.

5. Validar o login por e-mail/senha
- Capturar a resposta exata do Supabase no fluxo real.
- Se o backend estiver devolvendo erro global por configuração, corrigir no painel do Supabase.
- Se o frontend estiver mascarando o erro, ajustar os toasts/mensagens para expor corretamente a falha real.

6. Teste final obrigatório
- Testar ponta a ponta:
  - web em `picotinho.com.br`
  - URL publicada `picotinho.lovable.app`
  - APK
- Validar:
  - login com e-mail/senha
  - login com Google
  - restauração de sessão após recarregar
  - logout e novo login
  - retorno do Google para a home sem travar

Se os logs confirmarem problema de configuração no Supabase:
- aplico a correção no painel/configuração;
- mantenho no código apenas o hardening do auth para evitar recorrência.

Detalhes técnicos
- Arquivos mais críticos:
  - `src/App.tsx`
  - `src/components/auth/AuthProvider.tsx`
  - `src/pages/Auth.tsx`
  - configuração Auth/Google no Supabase
- Hipótese principal encontrada no código:
  - `src/App.tsx` limpa todo o storage e recarrega a app no bootstrap;
  - o cliente Supabase usa `localStorage` para sessão e PKCE;
  - isso pode quebrar restauração de sessão e retorno do OAuth.
- Fragilidade adicional:
  - o app inicializa auth em dois lugares diferentes (`AuthProvider` e `Auth.tsx`), aumentando risco de corrida e redirecionamento inconsistente.

Escopo esperado da implementação
- Sem mudança de banco, salvo se os logs revelarem algum problema estrutural fora do frontend.
- Foco em causa raiz, não em contorno temporário.
