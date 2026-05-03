// Wrapper centralizado para chamadas de normalização à Lovable AI Gateway.
// Sempre registra falhas em ia_normalizacao_erros para observabilidade total.

export type IATipoErro =
  | 'timeout'
  | 'gateway_429'
  | 'gateway_402'
  | 'gateway_5xx'
  | 'gateway_4xx'
  | 'parse'
  | 'invalid_response'
  | 'tool_call_missing'
  | 'desconhecido';

export interface IAOk {
  ok: true;
  data: any;
  raw: string;
  modelo: string;
  http_status: number;
}

export interface IAErr {
  ok: false;
  tipo_erro: IATipoErro;
  mensagem: string;
  http_status?: number;
}

export interface ChamarIAOpts {
  apiKey: string;
  modelo?: string;
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  timeoutMs?: number;
  // Para logging
  supabase: any;
  candidato_id?: string | null;
  texto_original?: string | null;
  // Validação mínima dos campos esperados no JSON
  camposObrigatorios?: string[];
}

const GATEWAY_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';

async function logErro(
  supabase: any,
  payloadEnviado: any,
  texto: string | null | undefined,
  candidato: string | null | undefined,
  modelo: string,
  tipo: IATipoErro,
  http_status: number | null,
  mensagem: string,
  resposta: any,
  tentativa: number
) {
  try {
    await supabase.from('ia_normalizacao_erros').insert({
      candidato_id: candidato ?? null,
      texto_original: texto ?? null,
      tipo_erro: tipo,
      http_status: http_status ?? null,
      modelo,
      mensagem: (mensagem || '').slice(0, 2000),
      payload_enviado: payloadEnviado ?? null,
      resposta_bruta: typeof resposta === 'string' ? { raw: resposta.slice(0, 4000) } : (resposta ?? null),
      tentativa,
    });
  } catch (e) {
    console.error('⚠️ Falha ao registrar erro IA:', (e as any)?.message);
  }
}

export async function chamarIANormalizacao(opts: ChamarIAOpts): Promise<IAOk | IAErr> {
  const modelo = opts.modelo || 'google/gemini-2.5-flash';
  const timeoutMs = opts.timeoutMs ?? 45_000;
  const camposObrig = opts.camposObrigatorios ?? ['nome_padrao', 'categoria', 'confianca'];

  const body = {
    model: modelo,
    messages: [
      { role: 'system', content: opts.systemPrompt },
      { role: 'user', content: opts.userPrompt },
    ],
    temperature: opts.temperature ?? 0.3,
  };

  const maxTentativas = 2; // 1 inicial + 1 retry só para 429/5xx
  let ultimaErr: IAErr | null = null;

  for (let tentativa = 1; tentativa <= maxTentativas; tentativa++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let resp: Response;
    try {
      resp = await fetch(GATEWAY_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${opts.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
    } catch (e: any) {
      clearTimeout(timer);
      const isTimeout = e?.name === 'AbortError';
      const tipo: IATipoErro = isTimeout ? 'timeout' : 'desconhecido';
      const msg = isTimeout ? `Timeout ${timeoutMs}ms` : (e?.message || 'fetch error');
      await logErro(opts.supabase, body, opts.texto_original, opts.candidato_id, modelo, tipo, null, msg, null, tentativa);
      ultimaErr = { ok: false, tipo_erro: tipo, mensagem: msg };
      // Sem retry em timeout/desconhecido
      return ultimaErr;
    }
    clearTimeout(timer);

    const status = resp.status;
    const rawText = await resp.text();

    if (!resp.ok) {
      let tipo: IATipoErro = 'gateway_4xx';
      if (status === 429) tipo = 'gateway_429';
      else if (status === 402) tipo = 'gateway_402';
      else if (status >= 500) tipo = 'gateway_5xx';

      await logErro(opts.supabase, body, opts.texto_original, opts.candidato_id, modelo, tipo, status, rawText.slice(0, 500), rawText, tentativa);
      ultimaErr = { ok: false, tipo_erro: tipo, mensagem: `HTTP ${status}`, http_status: status };

      // Retry só para 429 ou 5xx; nunca para 402
      if ((tipo === 'gateway_429' || tipo === 'gateway_5xx') && tentativa < maxTentativas) {
        await new Promise((r) => setTimeout(r, tentativa === 1 ? 1000 : 3000));
        continue;
      }
      return ultimaErr;
    }

    // Parse outer JSON
    let outer: any;
    try {
      outer = JSON.parse(rawText);
    } catch (e: any) {
      await logErro(opts.supabase, body, opts.texto_original, opts.candidato_id, modelo, 'parse', status, 'parse outer', rawText, tentativa);
      return { ok: false, tipo_erro: 'parse', mensagem: 'JSON externo inválido', http_status: status };
    }

    const content: string | undefined = outer?.choices?.[0]?.message?.content;
    if (!content || typeof content !== 'string') {
      await logErro(opts.supabase, body, opts.texto_original, opts.candidato_id, modelo, 'invalid_response', status, 'content vazio', outer, tentativa);
      return { ok: false, tipo_erro: 'invalid_response', mensagem: 'message.content ausente', http_status: status };
    }

    const limpo = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    let dados: any;
    try {
      dados = JSON.parse(limpo);
    } catch (e: any) {
      await logErro(opts.supabase, body, opts.texto_original, opts.candidato_id, modelo, 'parse', status, 'parse content', { content, limpo }, tentativa);
      return { ok: false, tipo_erro: 'parse', mensagem: 'JSON do modelo inválido', http_status: status };
    }

    // Validação mínima
    const faltando = camposObrig.filter((c) => dados?.[c] === undefined || dados?.[c] === null);
    if (faltando.length > 0) {
      await logErro(opts.supabase, body, opts.texto_original, opts.candidato_id, modelo, 'invalid_response', status, `Campos faltando: ${faltando.join(',')}`, dados, tentativa);
      return { ok: false, tipo_erro: 'invalid_response', mensagem: `Campos obrigatórios ausentes: ${faltando.join(',')}`, http_status: status };
    }

    return { ok: true, data: dados, raw: content, modelo, http_status: status };
  }

  return ultimaErr ?? { ok: false, tipo_erro: 'desconhecido', mensagem: 'Sem resposta' };
}
