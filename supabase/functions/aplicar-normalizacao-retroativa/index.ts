import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireMaster, authErrorResponse, corsHeaders } from "../_shared/auth.ts";

// Declaração mínima para o waitUntil do Edge Runtime
// deno-lint-ignore no-explicit-any
declare const EdgeRuntime: any;

const BATCH_SIZE = 10;

async function processarNotasEmBackground(
  supabase: ReturnType<typeof createClient>,
  jobId: string,
  notas: Array<{ id: string; usuario_id: string; dados_extraidos: any }>
) {
  const inicio = Date.now();
  let notasAtualizadas = 0;
  let processadas = 0;
  const normalizacoesAplicadasMap = new Map<
    string,
    { nome_original: string; nome_normalizado: string; quantidade_notas: number }
  >();

  const processarNota = async (nota: typeof notas[number]) => {
    try {
      const dadosExtraidos = nota.dados_extraidos as any;

      const nomeOriginal =
        dadosExtraidos?.supermercado?.nome ||
        dadosExtraidos?.estabelecimento?.nome ||
        dadosExtraidos?.emitente?.nome;

      if (!nomeOriginal || typeof nomeOriginal !== "string") return;

      const cnpjOriginal =
        dadosExtraidos?.estabelecimento?.cnpj ||
        dadosExtraidos?.emitente?.cnpj ||
        dadosExtraidos?.supermercado?.cnpj;

      const { data: nomeNormalizado, error: normError } = await supabase.rpc(
        "normalizar_nome_estabelecimento",
        {
          nome_input: nomeOriginal,
          cnpj_input: cnpjOriginal || null,
        }
      );

      if (normError) {
        console.error(`❌ Erro normalizar nota ${nota.id}:`, normError);
        return;
      }

      if (nomeNormalizado && nomeNormalizado !== nomeOriginal) {
        const dadosAtualizados = { ...dadosExtraidos };
        let camposAtualizados = 0;

        if (dadosAtualizados.supermercado?.nome) {
          dadosAtualizados.supermercado.nome = nomeNormalizado;
          camposAtualizados++;
        }
        if (dadosAtualizados.estabelecimento?.nome) {
          dadosAtualizados.estabelecimento.nome = nomeNormalizado;
          camposAtualizados++;
        }
        if (dadosAtualizados.emitente?.nome) {
          dadosAtualizados.emitente.nome = nomeNormalizado;
          camposAtualizados++;
        }

        if (camposAtualizados > 0) {
          const { error: updateError } = await supabase
            .from("notas_imagens")
            .update({
              dados_extraidos: dadosAtualizados,
              updated_at: new Date().toISOString(),
            })
            .eq("id", nota.id);

          if (updateError) {
            console.error(`❌ Erro update nota ${nota.id}:`, updateError);
            return;
          }

          notasAtualizadas++;
          const key = `${nomeOriginal}→${nomeNormalizado}`;
          const existing = normalizacoesAplicadasMap.get(key);
          if (existing) {
            existing.quantidade_notas++;
          } else {
            normalizacoesAplicadasMap.set(key, {
              nome_original: nomeOriginal,
              nome_normalizado: nomeNormalizado,
              quantidade_notas: 1,
            });
          }
        }
      }
    } catch (e) {
      console.error(`❌ Erro processar nota ${nota.id}:`, e);
    }
  };

  try {
    for (let i = 0; i < notas.length; i += BATCH_SIZE) {
      const lote = notas.slice(i, i + BATCH_SIZE);
      await Promise.all(lote.map(processarNota));
      processadas += lote.length;

      // Atualizar progresso a cada lote
      await supabase
        .from("normalizacao_retroativa_jobs")
        .update({
          processadas,
          atualizadas: notasAtualizadas,
          updated_at: new Date().toISOString(),
        })
        .eq("id", jobId);
    }

    const normalizacoesAplicadas = Array.from(normalizacoesAplicadasMap.values()).sort(
      (a, b) => b.quantidade_notas - a.quantidade_notas
    );

    await supabase
      .from("normalizacao_retroativa_jobs")
      .update({
        status: "completed",
        processadas,
        atualizadas: notasAtualizadas,
        normalizacoes_aplicadas: normalizacoesAplicadas,
        finished_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    console.log(
      `🎉 Job ${jobId} concluído em ${((Date.now() - inicio) / 1000).toFixed(2)}s. ` +
        `${notasAtualizadas}/${notas.length} atualizadas.`
    );
  } catch (e) {
    console.error(`❌ Falha fatal no job ${jobId}:`, e);
    await supabase
      .from("normalizacao_retroativa_jobs")
      .update({
        status: "failed",
        processadas,
        atualizadas: notasAtualizadas,
        erro: e instanceof Error ? e.message : String(e),
        finished_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // 🔐 Master-only
  let masterUserId: string | null = null;
  try {
    const auth = await requireMaster(req);
    masterUserId = auth?.user?.id ?? null;
  } catch (e) {
    return authErrorResponse(e);
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // 1. Buscar notas elegíveis
    const { data: notas, error: notasError } = await supabase
      .from("notas_imagens")
      .select("id, usuario_id, dados_extraidos")
      .eq("processada", true)
      .not("dados_extraidos", "is", null);

    if (notasError) throw notasError;

    const total = notas?.length ?? 0;

    // 2. Criar job
    const { data: jobData, error: jobError } = await supabase
      .from("normalizacao_retroativa_jobs")
      .insert({
        status: "processing",
        total,
        criado_por: masterUserId,
      })
      .select("id")
      .single();

    if (jobError || !jobData) {
      throw new Error(`Falha ao criar job: ${jobError?.message}`);
    }

    const jobId = jobData.id as string;

    // 3. Caso vazio: marcar concluído imediatamente
    if (total === 0) {
      await supabase
        .from("normalizacao_retroativa_jobs")
        .update({
          status: "completed",
          finished_at: new Date().toISOString(),
        })
        .eq("id", jobId);

      return new Response(
        JSON.stringify({ success: true, job_id: jobId, status: "completed", total: 0 }),
        { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Disparar processamento em background
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
      EdgeRuntime.waitUntil(processarNotasEmBackground(supabase, jobId, notas as any));
    } else {
      // Fallback (não bloqueia a resposta)
      processarNotasEmBackground(supabase, jobId, notas as any).catch((e) =>
        console.error("Erro background fallback:", e)
      );
    }

    return new Response(
      JSON.stringify({ success: true, job_id: jobId, status: "processing", total }),
      { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("❌ Erro fatal:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
