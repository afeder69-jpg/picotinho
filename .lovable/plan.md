
Objetivo: consolidar o suporte à entrada manual de chave de acesso para que o Picotinho identifique automaticamente o modelo 55/65, mantenha o fluxo atual de NFC-e e use InfoSimples para NF-e, sem criar fluxo paralelo.

O que encontrei no código atual
- `src/lib/documentDetection.ts` já tem:
  - limpeza da chave;
  - validação de 44 dígitos;
  - identificação automática do modelo pelos dígitos 21-22;
  - distinção entre `55` e `65`.
- `supabase/functions/process-url-nota/index.ts` já:
  - extrai/valida a chave;
  - identifica `modelo === '55'` ou `modelo === '65'`;
  - roteia `55` para `process-nfe-infosimples`;
  - mantém `65` no fluxo atual existente.
- `supabase/functions/process-nfe-infosimples/index.ts` já:
  - chama `POST /consultas/receita-federal/nfe`;
  - usa o token existente;
  - mapeia itens, valores e `ean_comercial`;
  - grava em formato compatível com o pipeline atual.
- Não parece haver necessidade de mudança de banco ou de criar novo fluxo de UI.

Plano de ajuste
1. Validar e alinhar o contrato ponta a ponta da chave manual
- Confirmar que a entrada manual continua enviando a chave limpa de 44 dígitos até `process-url-nota`.
- Garantir que nenhuma etapa intermediária ainda assume NFC-e por padrão.

2. Revisar o roteamento automático por modelo
- Confirmar que a chave é a fonte única de verdade para o modelo.
- Preservar:
  - `65` → fluxo atual de NFC-e sem alteração funcional;
  - `55` → InfoSimples NF-e.

3. Endurecer tratamento de erro
- Padronizar mensagens claras para:
  - chave com menos de 44 dígitos;
  - chave sem 44 dígitos numéricos válidos;
  - modelo diferente de `55` ou `65`;
  - resposta inválida da API de NF-e.

4. Validar o mapeamento da NF-e para o pipeline atual
- Confirmar que os dados salvos em `dados_extraidos` continuam compatíveis com o restante do processamento.
- Verificar prioridade de extração para:
  - itens/produtos;
  - valor total;
  - emitente/estabelecimento;
  - `ean_comercial` e campos equivalentes.

5. Revisar consistência com outros pontos do app
- Verificar se existe algum caminho alternativo de NF-e ainda chamando Serpro diretamente e, se houver, alinhar para evitar comportamento inconsistente entre entrada manual e outros fluxos.

Resultado esperado
- O usuário digita uma chave de 44 dígitos.
- O sistema valida a chave.
- O modelo é identificado automaticamente:
  - `55` → NF-e;
  - `65` → NFC-e.
- O Picotinho consulta a API correta e segue o processamento normal já existente, sem exigir escolha manual do usuário.

Detalhes técnicos
- Arquivos principais a revisar/ajustar:
  - `src/lib/documentDetection.ts`
  - `src/components/ManualKeyInput.tsx`
  - `supabase/functions/process-url-nota/index.ts`
  - `supabase/functions/process-nfe-infosimples/index.ts`
  - pontos alternativos de NF-e, se ainda houver chamada direta ao fluxo antigo
- Banco/RLS:
  - nenhuma mudança de schema parece necessária para esse ajuste.
