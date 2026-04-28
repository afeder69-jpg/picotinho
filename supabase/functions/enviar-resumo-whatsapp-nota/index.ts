// Edge Function: enviar-resumo-whatsapp-nota
// Envia notificação ao usuário via WhatsApp após o processamento de uma nota.
// Suporta dois tipos:
//   - resumo_nota_processada (sucesso)
//   - falha_processamento_nota (falha final)
//
// Garantias:
// - Idempotência via UNIQUE (nota_id, canal, tipo) em notificacoes_log
// - Fire-and-forget: NÃO interfere no fluxo de processamento da nota
// - Respeita preferência pref_resumo_notas do usuário
// - Falhas de envio só geram log; nunca bloqueiam nada

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type Tipo = "resumo_nota_processada" | "falha_processamento_nota";

interface Payload {
  nota_id: string;
  user_id: string;
  tipo: Tipo;
  // Campos opcionais usados apenas para tipo=resumo_nota_processada
  mercado?: string | null;
  total?: number | null;
  quantidade_itens?: number | null;
}

function formatarValorBRL(v: number | null | undefined): string {
  if (typeof v !== "number" || isNaN(v)) return "—";
  return v.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function montarMensagemSucesso(p: Payload): string {
  const mercado = (p.mercado || "—").toString().trim() || "—";
  const total = formatarValorBRL(p.total ?? null);
  const itens = typeof p.quantidade_itens === "number" ? p.quantidade_itens : 0;

  return [
    "✅ Sua nota foi processada com sucesso!",
    "",
    "Seu estoque já foi atualizado.",
    "",
    `Mercado: ${mercado}`,
    `Total da nota: ${total}`,
    `Itens adicionados: ${itens}`,
    "",
    "Obrigado por usar o Picotinho.",
  ].join("\n");
}

function montarMensagemFalha(): string {
  return [
    "⚠️ Não conseguimos processar sua nota fiscal.",
    "",
    "Seu estoque ainda não foi atualizado.",
    "",
    "Tente enviar novamente pelo Picotinho. Se o QR Code não funcionar, você pode digitar a chave de acesso de 44 dígitos. Se for uma nota com DANFE, também pode tentar ler o código de barras.",
    "",
    "Se o problema continuar, nossa equipe poderá analisar o caso.",
  ].join("\n");
}

// ----------------------------------------------------------------------------
// Camada opcional de humanização via Lovable AI (Fase 3)
// - Nunca bloqueia o envio: qualquer erro/timeout/validação inválida → fallback
// - Não inventa dados: validação obrigatória de presença dos números reais
// - Estrutura previsível: validação de ordem e elementos obrigatórios
// ----------------------------------------------------------------------------

interface DadosReaisSucesso {
  mercado: string;
  totalFormatado: string;
  itens: number;
}

const IA_TIMEOUT_MS = 3500;
const IA_MODELO = "google/gemini-3-flash-preview";

async function humanizarComIA(params: {
  base: string;
  tipo: Tipo;
  nomeUsuario: string | null;
  dadosSucesso: DadosReaisSucesso | null;
}): Promise<{
  mensagem: string | null;
  motivo: string | null;
  latenciaMs: number;
}> {
  const inicio = Date.now();
  const flag = (Deno.env.get("WHATSAPP_HUMANIZACAO_IA") || "on").toLowerCase();
  if (flag === "off") {
    return { mensagem: null, motivo: "ia_desabilitada", latenciaMs: 0 };
  }

  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) {
    return { mensagem: null, motivo: "lovable_api_key_ausente", latenciaMs: 0 };
  }

  const systemPrompt = [
    "Você é o Picotinho, assistente brasileiro masculino, simpático, ágil e direto.",
    "Reescreva a MENSAGEM BASE deixando-a mais natural e calorosa, mas mantendo:",
    "- Clareza, objetividade e fácil leitura no WhatsApp.",
    "- TODAS as informações factuais (mercado, total, quantidade de itens, instruções).",
    "- A mesma ORDEM lógica de leitura da mensagem base (saudação/status → dados → instruções/fechamento).",
    "- Quebras de linha entre blocos para leitura confortável no WhatsApp.",
    "Regras rígidas:",
    "- NÃO invente dados (não altere mercado, total ou quantidade).",
    "- NÃO use gírias, emojis em excesso (máx. 2) nem markdown.",
    "- NÃO use linguagem excessivamente informal; mantenha o tom profissional-amigável do Picotinho.",
    "- NÃO remova nenhuma informação obrigatória que apareça na mensagem base.",
    "- Pode usar o primeiro nome do usuário se fornecido, com naturalidade (sem repetir).",
    "- Máximo 600 caracteres.",
    "Responda SEMPRE chamando a tool 'mensagem_humanizada' com o campo 'mensagem'.",
  ].join("\n");

  const userPrompt = [
    `TIPO: ${params.tipo}`,
    params.nomeUsuario ? `NOME_USUARIO: ${params.nomeUsuario}` : "NOME_USUARIO: (não informado)",
    params.dadosSucesso
      ? `DADOS_REAIS: mercado="${params.dadosSucesso.mercado}", total="${params.dadosSucesso.totalFormatado}", itens=${params.dadosSucesso.itens}`
      : "DADOS_REAIS: (n/a — mensagem de falha)",
    "",
    "MENSAGEM BASE (preserve todas as informações):",
    params.base,
  ].join("\n");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IA_TIMEOUT_MS);

  try {
    const resp = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: IA_MODELO,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "mensagem_humanizada",
                description:
                  "Retorna a mensagem WhatsApp humanizada para o usuário.",
                parameters: {
                  type: "object",
                  properties: {
                    mensagem: {
                      type: "string",
                      description:
                        "Texto final em pt-BR pronto para envio no WhatsApp.",
                    },
                  },
                  required: ["mensagem"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: {
            type: "function",
            function: { name: "mensagem_humanizada" },
          },
        }),
      },
    );

    if (!resp.ok) {
      const motivo =
        resp.status === 429
          ? "ia_rate_limit_429"
          : resp.status === 402
            ? "ia_credito_402"
            : `http_error_${resp.status}`;
      return { mensagem: null, motivo, latenciaMs: Date.now() - inicio };
    }

    const data = await resp.json();
    const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
    const argsRaw = toolCall?.function?.arguments;
    if (!argsRaw) {
      return {
        mensagem: null,
        motivo: "tool_call_ausente",
        latenciaMs: Date.now() - inicio,
      };
    }

    let parsed: { mensagem?: unknown };
    try {
      parsed = JSON.parse(argsRaw);
    } catch {
      return {
        mensagem: null,
        motivo: "json_invalido",
        latenciaMs: Date.now() - inicio,
      };
    }

    const mensagem = typeof parsed?.mensagem === "string"
      ? parsed.mensagem.trim()
      : "";

    if (!mensagem || mensagem.length < 40 || mensagem.length > 700) {
      return {
        mensagem: null,
        motivo: "tamanho_invalido",
        latenciaMs: Date.now() - inicio,
      };
    }

    // Bloqueio anti-alucinação e estrutura mínima
    if (params.tipo === "resumo_nota_processada" && params.dadosSucesso) {
      const { mercado, totalFormatado, itens } = params.dadosSucesso;
      const contemMercado =
        !mercado || mercado === "—" ||
        mensagem.toLowerCase().includes(mercado.toLowerCase());
      const contemTotal = mensagem.includes(totalFormatado);
      const contemItens = new RegExp(`\\b${itens}\\b`).test(mensagem);
      if (!contemMercado || !contemTotal || !contemItens) {
        return {
          mensagem: null,
          motivo: "validacao_dados_reais",
          latenciaMs: Date.now() - inicio,
        };
      }
    }

    if (params.tipo === "falha_processamento_nota") {
      // Garante que instruções essenciais permanecem na mensagem
      const lower = mensagem.toLowerCase();
      const temInstrucao =
        lower.includes("picotinho") &&
        (lower.includes("chave") || lower.includes("qr") ||
          lower.includes("danfe") || lower.includes("novamente"));
      if (!temInstrucao) {
        return {
          mensagem: null,
          motivo: "validacao_instrucoes_falha",
          latenciaMs: Date.now() - inicio,
        };
      }
    }

    // Bloqueia caracteres de controle e URLs
    if (/[\u0000-\u0008\u000B-\u001F]/.test(mensagem) || /https?:\/\//i.test(mensagem)) {
      return {
        mensagem: null,
        motivo: "conteudo_proibido",
        latenciaMs: Date.now() - inicio,
      };
    }

    return { mensagem, motivo: null, latenciaMs: Date.now() - inicio };
  } catch (e: any) {
    const motivo = e?.name === "AbortError" ? "timeout" : `exception:${e?.message || String(e)}`;
    return { mensagem: null, motivo, latenciaMs: Date.now() - inicio };
  } finally {
    clearTimeout(timer);
  }
}

function extrairPrimeiroNome(nome: string | null | undefined): string | null {
  if (!nome || typeof nome !== "string") return null;
  const limpo = nome.trim();
  if (!limpo) return null;
  const primeiro = limpo.split(/\s+/)[0];
  return primeiro && primeiro.length >= 2 ? primeiro : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let body: Payload;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: "JSON inválido" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const { nota_id, user_id, tipo } = body;
  if (!nota_id || !user_id || !tipo) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "nota_id, user_id e tipo são obrigatórios",
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  if (
    tipo !== "resumo_nota_processada" &&
    tipo !== "falha_processamento_nota"
  ) {
    return new Response(
      JSON.stringify({ success: false, error: "tipo inválido" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const canal = "whatsapp";

  try {
    // 1) Idempotência: já existe log para (nota_id, canal, tipo)?
    const { data: existente } = await supabase
      .from("notificacoes_log")
      .select("id, status")
      .eq("nota_id", nota_id)
      .eq("canal", canal)
      .eq("tipo", tipo)
      .maybeSingle();

    if (existente) {
      console.log(
        `⏭️ Notificação já registrada para nota=${nota_id} tipo=${tipo} (status=${existente.status}) — pulando.`,
      );
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "ja_enviada" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // 2) Buscar telefone autorizado do usuário (ativo + verificado) e checar preferência
    const { data: telefone, error: telErr } = await supabase
      .from("whatsapp_telefones_autorizados")
      .select("numero_whatsapp, ativo, verificado, pref_resumo_notas, nome_pessoa")
      .eq("usuario_id", user_id)
      .eq("ativo", true)
      .eq("verificado", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (telErr) {
      console.error("Erro ao buscar telefone:", telErr);
    }

    if (!telefone || !telefone.numero_whatsapp) {
      await supabase.from("notificacoes_log").insert({
        nota_id,
        user_id,
        canal,
        tipo,
        status: "pulado",
        erro: "sem_telefone_ativo_verificado",
      });
      return new Response(
        JSON.stringify({
          success: true,
          skipped: true,
          reason: "sem_telefone",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (telefone.pref_resumo_notas === false) {
      await supabase.from("notificacoes_log").insert({
        nota_id,
        user_id,
        canal,
        tipo,
        telefone: telefone.numero_whatsapp,
        status: "pulado",
        erro: "preferencia_desativada",
      });
      return new Response(
        JSON.stringify({
          success: true,
          skipped: true,
          reason: "preferencia_off",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // 3) Montar mensagem base (template atual — sempre disponível como fallback)
    const mensagemBase =
      tipo === "resumo_nota_processada"
        ? montarMensagemSucesso(body)
        : montarMensagemFalha();

    // 3.1) Resolver nome do usuário (telefone → profiles)
    let nomeUsuario = extrairPrimeiroNome(telefone.nome_pessoa);
    if (!nomeUsuario) {
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("nome_completo, apelido, nome")
          .eq("user_id", user_id)
          .maybeSingle();
        nomeUsuario =
          extrairPrimeiroNome(profile?.apelido) ||
          extrairPrimeiroNome(profile?.nome_completo) ||
          extrairPrimeiroNome((profile as any)?.nome);
      } catch (e) {
        console.warn("Falha ao buscar profile para nome do usuário:", e);
      }
    }

    // 3.2) Camada opcional de humanização via Lovable AI
    const dadosSucesso: DadosReaisSucesso | null =
      tipo === "resumo_nota_processada"
        ? {
            mercado: ((body.mercado || "—").toString().trim() || "—"),
            totalFormatado: formatarValorBRL(body.total ?? null),
            itens: typeof body.quantidade_itens === "number" ? body.quantidade_itens : 0,
          }
        : null;

    const humanizacao = await humanizarComIA({
      base: mensagemBase,
      tipo,
      nomeUsuario,
      dadosSucesso,
    });

    const mensagem = humanizacao.mensagem ?? mensagemBase;
    const mensagemOrigem: "ia" | "fallback" = humanizacao.mensagem ? "ia" : "fallback";

    // 4) Enviar via Z-API
    const instanceUrl = Deno.env.get("WHATSAPP_INSTANCE_URL");
    const apiToken = Deno.env.get("WHATSAPP_API_TOKEN");
    const accountSecret = Deno.env.get("WHATSAPP_ACCOUNT_SECRET");

    if (!instanceUrl || !apiToken || !accountSecret) {
      await supabase.from("notificacoes_log").insert({
        nota_id,
        user_id,
        canal,
        tipo,
        telefone: telefone.numero_whatsapp,
        status: "falhou",
        erro: "zapi_nao_configurado",
      });
      return new Response(
        JSON.stringify({ success: false, error: "Z-API não configurado" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const sendTextUrl = `${instanceUrl}/token/${apiToken}/send-text`;

    let zapiStatus = 0;
    let zapiBody = "";
    try {
      const resp = await fetch(sendTextUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Client-Token": accountSecret,
        },
        body: JSON.stringify({
          phone: telefone.numero_whatsapp,
          message: mensagem,
        }),
      });
      zapiStatus = resp.status;
      zapiBody = await resp.text();
    } catch (e: any) {
      await supabase.from("notificacoes_log").insert({
        nota_id,
        user_id,
        canal,
        tipo,
        telefone: telefone.numero_whatsapp,
        status: "falhou",
        erro: `network_error: ${e?.message || String(e)}`,
      });
      return new Response(
        JSON.stringify({ success: false, error: "falha_rede_zapi" }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    let okEnvio = zapiStatus >= 200 && zapiStatus < 300;
    if (okEnvio) {
      try {
        const parsed = JSON.parse(zapiBody);
        if (parsed && parsed.error) okEnvio = false;
      } catch {
        // não-JSON: trate como sucesso (mesmo padrão das demais funções)
      }
    }

    await supabase.from("notificacoes_log").insert({
      nota_id,
      user_id,
      canal,
      tipo,
      telefone: telefone.numero_whatsapp,
      status: okEnvio ? "enviado" : "falhou",
      erro: okEnvio ? null : `zapi_status_${zapiStatus}: ${zapiBody.slice(0, 500)}`,
      payload: {
        zapi_status: zapiStatus,
        zapi_body_preview: zapiBody.slice(0, 500),
        mensagem_origem: mensagemOrigem,
        ia_motivo_fallback: humanizacao.motivo,
        ia_modelo: IA_MODELO,
        ia_latencia_ms: humanizacao.latenciaMs,
      },
    });

    return new Response(
      JSON.stringify({ success: okEnvio }),
      {
        status: okEnvio ? 200 : 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error: any) {
    console.error("Erro inesperado em enviar-resumo-whatsapp-nota:", error);
    // Best effort: registrar log de falha sem quebrar idempotência
    try {
      await supabase.from("notificacoes_log").insert({
        nota_id,
        user_id,
        canal,
        tipo,
        status: "falhou",
        erro: `exception: ${error?.message || String(error)}`,
      });
    } catch {
      // ignore (provavelmente conflito de unique → já existe registro)
    }
    return new Response(
      JSON.stringify({
        success: false,
        error: error?.message || String(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
