
Objetivo: confirmar e corrigir a falha global de login com base em evidência, não em hipótese.

Diagnóstico já confirmado
- `src/integrations/supabase/client.ts` aponta para a URL correta do projeto: `https://mjsbwrtegorjxcepvrik.supabase.co`.
- As páginas publicadas `/auth` em `picotinho.com.br` e `picotinho.lovable.app` carregam normalmente.
- Os auth logs do Supabase vieram vazios nas últimas 24h e também em 7 dias.
- Isso indica que as tentativas de login não estão chegando ao backend de Auth. A quebra está antes do Supabase processar a requisição, na camada de conexão/rede/DNS do cliente para `mjsbwrtegorjxcepvrik.supabase.co`.

Plano de implementação
1. Instrumentar o fluxo de login
- Adicionar um diagnóstico explícito antes de `signInWithPassword` e `signInWithOAuth`.
- Testar conectividade real com o Auth do Supabase e capturar:
  - status HTTP
  - erro de DNS/fetch
  - `navigator.onLine`
  - origin atual
  - plataforma web/nativa
- Exibir mensagem técnica clara em vez de erro genérico.

2. Criar telemetria de diagnóstico no frontend
- Centralizar isso num helper de auth/rede.
- Registrar no console detalhes suficientes para distinguir:
  - DNS não resolve
  - timeout
  - CORS
  - provider OAuth inválido
  - redirect inválido
  - backend respondeu com erro funcional

3. Revisar o bootstrap de auth
- Confirmar que `AuthProvider` continua como fonte principal da sessão.
- Remover redundâncias que possam mascarar erro de rede como erro de login.
- Garantir que o loading do Google volte ao normal se a abertura do OAuth falhar antes do redirect.

4. Validar configuração externa do Supabase
- Conferir no dashboard:
  - Site URL
  - Redirect URLs web
  - deep link `picotinho://auth/callback`
  - provider Google habilitado
- Isso não explica o DNS por si só, mas elimina causas paralelas.

5. Teste final em ambiente publicado
- Validar em `picotinho.com.br` e `picotinho.lovable.app`:
  - e-mail/senha
  - Google
  - mensagem de erro detalhada quando houver falha
- Se o diagnóstico continuar acusando DNS, a conclusão fica fechada: problema externo de resolução/conectividade com o domínio `*.supabase.co`, não de credenciais nem de RLS.

Arquivos envolvidos
- `src/pages/Auth.tsx`
- `src/components/auth/AuthProvider.tsx`
- `src/integrations/supabase/client.ts`
- novo helper de diagnóstico em `src/lib/*`

Resultado esperado
- Saber com precisão absoluta em qual camada quebra.
- Parar de tratar um erro de rede/DNS como se fosse “erro de login”.
- Ter evidência objetiva para corrigir o app ou, se confirmado, agir na infraestrutura/configuração externa.
