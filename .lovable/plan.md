## Correção do bloqueio de acesso restrito

Hoje, com `acesso_restrito = true` e visitante não logado:
- `/menu` é redirecionado para `/auth` pelo `RestrictedRouteGuard` (rota não está na whitelist).
- O botão central de QR Code abre o scanner livremente — só checa login depois do scan.

A correção é cirúrgica e mexe apenas no comportamento de visitante no modo restrito. Login, cadastro com convite e fluxo de usuários logados ficam intactos.

### Arquivos a editar

**1. `src/components/auth/RestrictedRouteGuard.tsx`**
- Adicionar `/menu` à lista `ROTAS_PUBLICAS`.
- Resultado: a página `/menu` carrega para visitante, mas (item 2) renderiza tudo travado.

**2. `src/pages/Menu.tsx`** (já tem `bloqueado = acessoRestrito && !user` e exibe banner)
- Garantir que, quando `bloqueado`, TODOS os cards (incluindo os cards master e o card "Convites") fiquem desabilitados visualmente e, ao clicar, exibam apenas o toast `"Você precisa estar logado para acessar."` sem navegar.
- Os cards master/convites já só aparecem quando `isMaster=true`, então sem login eles não aparecem — nada a fazer aí.
- Os cards do `menuOptions` já têm a checagem `bloqueado`. Confirmar que está aplicada e que o toast é exatamente esse texto.

**3. `src/components/BottomNavigation.tsx`**
- No `handleQRButtonClick`, antes de `setShowQRScanner(true)`, ler `useAppConfig` + `useAuth`:
  - Se `acessoRestrito && !user`: `toast({ title: "Você precisa estar logado para enviar nota fiscal." })` e `return`.
- Adicionar import do hook `useAppConfig`.
- O botão Menu (`navigate('/menu')`) continua livre — agora `/menu` é público e a própria página trava as opções.

**4. Proteção das telas de leitura de nota (defesa em profundidade)**

O scanner é renderizado dentro do `BottomNavigation` (não há rota dedicada), então bloquear o `handleQRButtonClick` já cobre o caminho normal. Mesmo assim, para garantir que visitante não consiga abrir scanner por outros caminhos (evento `open-scanner` disparado por outras páginas):

- No `useEffect` que escuta `'open-scanner'`, adicionar a mesma checagem `acessoRestrito && !user` antes de `setShowQRScanner(true)` e exibir o mesmo toast.

- Também checar dentro do early-return do `executeNoteProcessing`/`handleQRScanSuccess` já existe (`if (!user?.id)`), o que garante que mesmo se o scanner abrir, o processamento não acontece.

### Comportamento final (visitante, modo restrito)

- Botão Home → abre `/` (público). OK.
- Botão Menu → abre `/menu` com banner "🔒 Acesso restrito" e todos os cards desabilitados; clique em qualquer card mostra toast `"Você precisa estar logado para acessar."`.
- Botão central QR Code → não abre scanner; mostra toast `"Você precisa estar logado para enviar nota fiscal."`.
- Tentativa de disparar evento `open-scanner` → bloqueada com mesmo toast.

### O que NÃO é alterado

- `RestrictedRouteGuard` continua redirecionando todas as outras rotas privadas (`/estoque`, `/screenshots`, `/relatorios`, etc.) para `/auth`.
- Login, signup, fluxo de convite (`/auth`, `consumir-convite`, `confirmar-convite`) — intocados.
- Comportamento para usuários logados — intocado.
- Pipeline de processamento de nota — intocado.

Posso aplicar?