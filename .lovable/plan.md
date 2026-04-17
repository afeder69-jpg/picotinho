

## Diagnóstico: erro de DNS no Supabase

A mensagem "Não foi possível encontrar o endereço IP do servidor de mjsbwrtegorjxcepvrik.supabase.co" é um **erro de DNS no domínio do Supabase**, não no Picotinho.

### O que está acontecendo

O navegador está tentando resolver o domínio `mjsbwrtegorjxcepvrik.supabase.co` e falhando. Isso significa que a requisição **nem chega ao Supabase** — para antes, na resolução de nome.

### Causas possíveis (em ordem de probabilidade)

1. **Incidente no Supabase** (DNS/infra do provedor) — afeta todos os usuários do projeto simultaneamente, exatamente como você descreveu.
2. **Problema no provedor de DNS público** (ex: Google DNS 8.8.8.8, Cloudflare 1.1.1.1) propagando incorretamente o subdomínio.
3. **Projeto Supabase pausado ou suspenso** — quando isso acontece, o subdomínio pode parar de resolver.
4. **Problema de rede regional** afetando rotas para `*.supabase.co`.

### O que NÃO é

- Não é bug do código do Picotinho (nada mudou no client, na URL ou nas chaves).
- Não é problema de autenticação (Google ou e-mail/senha) — a falha acontece **antes** de qualquer chamada de auth.
- Não é problema de RLS, edge function ou banco.

### Verificações que vou fazer (somente leitura)

1. **Status do projeto Supabase** — checar se o projeto está ativo respondendo consultas via `supabase--read_query`. Se o banco responder pelo backend interno, mas o domínio público não resolver, confirma que é DNS/edge do Supabase.
2. **Status page do Supabase** — verificar https://status.supabase.com para incidentes ativos.
3. **Logs recentes** — checar se há tráfego chegando ao projeto agora ou se parou completamente.
4. **Resolução DNS externa** — tentar resolver o domínio via ferramenta externa para confirmar se o problema é global ou local.

### Ações imediatas que o usuário pode tentar (enquanto investigo)

- Trocar de rede (Wi-Fi → 4G ou vice-versa) para descartar DNS local.
- Limpar cache DNS do navegador / dispositivo.
- Trocar o DNS do dispositivo para 1.1.1.1 (Cloudflare) ou 8.8.8.8 (Google).
- Testar em modo anônimo / outro navegador.

### Próximo passo

Após sua aprovação, executo as verificações acima e trago um diagnóstico objetivo: se é incidente do Supabase (e nesse caso só resta aguardar/abrir ticket), se é o projeto suspenso (precisa reativar no painel), ou se é algo mais específico.

**Importante**: nenhuma alteração de código será feita nesta etapa — é puro diagnóstico.

