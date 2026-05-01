# Plano: Suporte a NFC-e do Ceará (CE) via InfoSimples

## Objetivo

Adicionar processamento de NFC-e emitidas no Ceará (UF 23) usando o endpoint InfoSimples específico do CE, **sem alterar nada do fluxo atual** (RJ via InfoSimples e demais UFs via extração HTML).

## Estratégia

Criar uma **nova edge function isolada** `process-nfce-infosimples-ce` (clone enxuto do RJ adaptado ao payload do CE) e adicionar **um único `else if`** em `process-url-nota` para rotear UF=23 para ela. Tudo o que já funciona segue intacto.

```text
QR escaneado
   │
   ▼
process-url-nota  ── modelo=65 + UF=33 ──▶ process-nfce-infosimples       (RJ, inalterado)
                 ── modelo=65 + UF=23 ──▶ process-nfce-infosimples-ce    (NOVO)
                 ── modelo=65 + outras─▶ extract-receipt-image           (inalterado)
                 ── modelo=55         ──▶ process-nfe-infosimples        (inalterado)
```

## Mudanças

### 1. Nova edge function: `supabase/functions/process-nfce-infosimples-ce/index.ts`

Provider exclusivo do Ceará. Estrutura espelhada na do RJ para reaproveitar o restante do pipeline (cache `nfce_cache_infosimples`, normalização de estabelecimento via RPC `normalizar_nome_estabelecimento`, `finalize-nota-estoque`, status `aguardando_estoque`, `NfcePendenteSefazError`, idempotência etc.).

**Pontos específicos do CE:**

- **Endpoint:** `POST https://api.infosimples.com/api/v2/consultas/sefaz/ce/nfce`
  - Body `application/x-www-form-urlencoded`: `token`, `nfce` (chave 44 dígitos), `timeout=600`.
  - Reusa o secret `INFOSIMPLES_TOKEN` já existente.
- **Log:** prefixo `[NFCE-CE]` em toda execução para auditar uso do provider.
- **Cache:** `nfce_cache_infosimples` reaproveitado (chave de acesso é única globalmente).
- **Mapeamento da resposta:**
  | Campo destino                  | Origem                                                  |
  |-------------------------------|----------------------------------------------------------|
  | `estabelecimento.nome`        | `data[0].emitente.nome` (com normalização via RPC)       |
  | `estabelecimento.cnpj`        | `data[0].emitente.cnpj` (apenas dígitos)                 |
  | `compra.data_emissao`         | `data[0].nfe.data_emissao` (parser seguro — ver abaixo)  |
  | `valor_total` / `compra.valor_total` | `data[0].nfe.normalizado_valor_total`             |
  | `itens[]`                     | `data[0].produtos[]`                                     |

  Para cada item:
  | Campo destino       | Origem                          |
  |---------------------|---------------------------------|
  | `nome` / `descricao`| `descricao`                     |
  | `quantidade`        | `qtd` (via `parseBrazilianFloat`) |
  | `valor_total`       | `normalizado_valor`             |
  | `valor_unitario`    | `valor_unitario_comercial`      |
  | `codigo_barras`     | `ean_comercial` (sanitizado, ver abaixo) |
  | `categoria`         | `categorizarProduto(descricao)` |
  | `unidade`           | `p.unidade || 'UN'`             |

- **Fallback de `valor_unitario`:**
  ```ts
  let valorUnitario = parseBrazilianFloat(p.valor_unitario_comercial);
  if (!valorUnitario || valorUnitario <= 0) {
    valorUnitario = quantidade > 0 ? +(valorTotalItem / quantidade).toFixed(6) : 0;
    console.log('[NFCE-CE] valor_unitario_comercial ausente, calculado');
  }
  ```

- **AJUSTE 1 — Parser seguro de data:** função `parseDataEmissao(raw)` que aceita ISO (`2025-10-04T09:43:14-03:00`) e formato brasileiro (`DD/MM/YYYY HH:mm:ss`, com ou sem timezone), e trata `YYYY-MM-DD` como literal local (`YYYY-MM-DDT00:00:00`). **Nunca** usa `new Date('YYYY-MM-DD')` direto, evitando o bug clássico de timezone que retrocede o dia em UTC-3. Mesma estratégia já adotada no provider RJ.

- **AJUSTE 2 — Sanitização de EAN:** função `limparEAN(valor)` retorna `null` para:
  - vazio / `undefined` / `null`
  - string `"SEM GTIN"` (qualquer caixa, com ou sem espaços)
  - somente zeros
  - tamanhos diferentes de 8/12/13/14 dígitos (padrões EAN-8, UPC-A, EAN-13, GTIN-14)
  - qualquer valor sem dígitos válidos

  Garante que `codigo_barras` no banco fique limpo, sem poluição.

- **Pendência SEFAZ:** mesma classificação via `classificarRespostaInfoSimples` + `NfcePendenteSefazError` para integrar com retry/notificações já existentes.
- **Persistência:** mesmo `update` em `notas_imagens` com `status_processamento: 'aguardando_estoque'` e disparo fire-and-forget de `finalize-nota-estoque` — mantém o ciclo `pendente_consulta → aguardando_estoque → processando → processada` idêntico ao atual.
- **Sem alterações** em normalização, categorização, banco, RLS, schema ou tabelas.

### 2. Roteamento em `supabase/functions/process-url-nota/index.ts`

Adicionar **um único bloco** antes do `else if (modelo === '65' && uf === '33')`:

```ts
} else if (modelo === '65' && uf === '23') {
  console.log('🎫 [NFCE-CE] Processando via InfoSimples (Ceará)...');
  const { data: nfceData, error: nfceError } = await supabase.functions.invoke(
    'process-nfce-infosimples-ce',
    { body: { chaveAcesso: chave, userId, notaImagemId: notaId } }
  );
  if (nfceError) {
    console.error('⚠️ Erro ao processar NFCe-CE via InfoSimples:', nfceError);
    errosCapturados.push(await extrairBodyErroEdge(nfceError));
  } else if (nfceData?.pendente === true) {
    console.warn('⏳ [NFCE-CE] Pendente SEFAZ:', nfceData.motivo);
    pendenteSefaz = { motivo: nfceData.motivo || 'sefaz_nao_autorizada', detalhe: nfceData.detalhe || '' };
  } else {
    console.log('✅ NFCe-CE processada via InfoSimples:', nfceData);
    extracaoSucesso = true;
  }
}
```

Nada mais é alterado nesse arquivo. UF 33 segue no caminho RJ; demais UFs seguem para `extract-receipt-image`.

### 3. Nada a fazer

- Sem migrations.
- Sem mudanças em `process-receipt-full`, `finalize-nota-estoque`, `retry-consulta-nfce-pendente`, frontend, normalização, ou tipos.
- Sem novos secrets (`INFOSIMPLES_TOKEN` já existe).

## Garantias

- Fluxo RJ (UF 33) **não tocado**.
- Fluxo NFe (modelo 55) **não tocado**.
- Fallback HTML para outras UFs **não tocado**.
- Reentrada de pendências, idempotência de reescaneamento e notificações pós-pendência continuam funcionando porque o provider CE termina exatamente no mesmo estado (`aguardando_estoque`) e usa o mesmo `NfcePendenteSefazError`.
- Datas livres do bug de timezone (parser seguro).
- `codigo_barras` nunca será gravado como `"SEM GTIN"`, vazio, ou string inválida.
- Logs `[NFCE-CE]` permitem auditar quando o provider foi utilizado.

## Validação sugerida pós-deploy

1. Escanear NFC-e do Ceará → conferir log `[NFCE-CE] Iniciando (provider Ceará)...`.
2. Conferir em `notas_imagens.dados_extraidos.itens` se `valor_unitario` veio correto (com e sem `valor_unitario_comercial` na origem) e `codigo_barras` como `null` quando origem é `"SEM GTIN"`.
3. Conferir `compra.data_emissao` no fuso correto (sem retroceder um dia).
4. Conferir transição `aguardando_estoque → processando → processada`.
5. Reescanear a mesma chave durante `pendente_consulta` → resposta idempotente (já garantida em `process-url-nota`).
