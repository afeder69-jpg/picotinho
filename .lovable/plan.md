
Objetivo: adicionar suporte a NF-e (modelo 55) via InfoSimples sem mexer no fluxo atual de NFC-e (65) além do roteamento por modelo, mantendo a mesma entrada manual de chave e o mesmo pipeline posterior de processamento.

O que validei no código
- A entrada manual já valida 44 dígitos e modelo 55/65 em `src/components/ManualKeyInput.tsx` + `src/lib/documentDetection.ts`.
- Hoje a chave manual vira uma URL sintética em `QRCodeScanner.tsx` e `QRCodeScannerWeb.tsx`, e o restante passa por `handleQRScanSuccess()` em `src/components/BottomNavigation.tsx`.
- O gargalo está no backend: `supabase/functions/process-url-nota/index.ts` ainda roteia:
  - `55` → `process-nfe-serpro`
  - `65` RJ → `process-nfce-infosimples`
  - `65` outras UFs → fallback HTML
- O token `INFOSIMPLES_TOKEN` já existe.
- O pipeline downstream já aceita itens com `codigo_barras`, `codigo_barras_comercial` ou `ean_comercial` em `process-receipt-full`, então dá para integrar NF-e sem criar fluxo paralelo.

Plano de implementação

1. Centralizar a detecção do modelo pela chave
- Reforçar `src/lib/documentDetection.ts` para expor helpers baseados na própria chave:
  - limpar/normalizar chave
  - identificar modelo `55`/`65`
  - retornar erro claro para modelo inválido
- Manter `validarChaveAcesso()` como porta de entrada para a UI.
- Isso evita qualquer suposição de que chave manual seja sempre NFC-e.

2. Ajustar a entrada manual sem mudar a UX
- Em `src/components/QRCodeScanner.tsx` e `src/components/QRCodeScannerWeb.tsx`, manter a UX atual: o usuário só digita a chave.
- Continuar reaproveitando o fluxo existente, mas garantir que a chave correta siga adiante e que o roteamento dependa do modelo detectado, não de uma suposição implícita.

3. Tornar o roteamento do backend explícito por modelo
- Em `supabase/functions/process-url-nota/index.ts`:
  - validar novamente a chave;
  - derivar `modelo` diretamente da chave;
  - falhar com mensagem clara se o modelo não for `55` nem `65`;
  - preservar criação da `notas_imagens` e o pipeline existente.
- Novo roteamento:
  - `65` → manter fluxo atual de NFC-e exatamente como está;
  - `55` → chamar novo fluxo InfoSimples de NF-e;
  - desconhecido → retornar erro claro, sem assumir fallback silencioso.

4. Criar a edge function de NF-e via InfoSimples
- Adicionar uma nova função, separada da de NFC-e, para minimizar risco no fluxo já estável:
  - sugestão: `supabase/functions/process-nfe-infosimples/index.ts`
- Essa função deve:
  - receber `chaveAcesso`, `userId`, `notaImagemId`;
  - consultar `POST https://api.infosimples.com/api/v2/consultas/receita-federal/nfe`;
  - enviar `token` existente + `nfe` com a chave digitada;
  - opcionalmente reutilizar cache em `nfe_cache_serpro` num segundo momento, mas idealmente criar/adaptar o armazenamento para refletir a nova origem sem quebrar o que já existe;
  - transformar a resposta para o formato já esperado em `notas_imagens.dados_extraidos`.

5. Mapear a resposta da NF-e para o formato já aceito pelo sistema
- O processamento da NF-e InfoSimples deve salvar estrutura compatível com o que `process-receipt-full` já entende:
  - lista de itens em `produtos` ou `itens`;
  - `estabelecimento`;
  - `valor_total`;
  - `data_emissao`;
  - `chave_acesso`;
  - `ean_comercial`/`codigo_barras` quando disponível.
- Prioridade de extração dos itens:
  - nome/descrição do produto;
  - quantidade;
  - unidade;
  - valor unitário;
  - valor total;
  - EAN comercial quando existir.
- Assim o restante do fluxo segue “normalmente”, como você pediu.

6. Preservar NFC-e sem alterações funcionais
- `supabase/functions/process-nfce-infosimples/index.ts` não precisa mudar de lógica.
- Só o chamador (`process-url-nota`) passa a decidir melhor entre 55 e 65.
- Isso reduz risco de regressão no fluxo já existente de NFC-e.

7. Validação esperada após implementação
- Chave com 44 dígitos e modelo 65:
  - segue exatamente o fluxo atual.
- Chave com 44 dígitos e modelo 55:
  - consulta a API de NF-e do InfoSimples;
  - grava os dados no mesmo pipeline de `notas_imagens`;
  - segue para realtime/validação/processamento como hoje.
- Chave inválida ou modelo desconhecido:
  - erro claro antes da consulta.

Detalhes técnicos
- Arquivos principais:
  - `src/lib/documentDetection.ts`
  - `src/components/QRCodeScanner.tsx`
  - `src/components/QRCodeScannerWeb.tsx`
  - `src/components/BottomNavigation.tsx`
  - `supabase/functions/process-url-nota/index.ts`
  - `supabase/functions/process-nfe-infosimples/index.ts` (novo)
- Ponto de menor risco:
  - não mexer na UI;
  - não alterar `process-nfce-infosimples`;
  - não criar fluxo paralelo;
  - apenas adicionar o ramo InfoSimples para modelo 55 e normalizar a resposta para o formato já consumido.
- Observação importante:
  - como o fluxo atual de NF-e ainda usa Serpro em outros pontos, também vale revisar `src/components/InternalWebViewer.tsx`, que hoje chama `process-nfe-serpro` diretamente, para evitar comportamento inconsistente entre entrada manual e outros caminhos de NFe.
