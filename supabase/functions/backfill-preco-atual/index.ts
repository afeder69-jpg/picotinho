import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type BackfillRequest = {
  userId: string;
  produtoNome: string; // Nome canônico do produto (ex.: "AÇÚCAR")
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { userId, produtoNome } = (await req.json()) as BackfillRequest;

    if (!userId || !produtoNome) {
      return new Response(
        JSON.stringify({ success: false, error: "userId e produtoNome são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const logs: any[] = [];

    // 1) Buscar raio de atuação (para log) – a filtragem prática será pelas notas do próprio usuário
    const { data: configUser } = await supabase
      .from("configuracoes_usuario")
      .select("raio_busca_km")
      .eq("usuario_id", userId)
      .maybeSingle();

    logs.push({ tipo: "INFO", msg: `Raio de busca do usuário: ${configUser?.raio_busca_km ?? 5}km` });

    // 2) Carregar notas já processadas deste usuário (ignorar manual)
    const { data: notas, error: notasError } = await supabase
      .from("notas_imagens")
      .select("id, created_at, dados_extraidos")
      .eq("usuario_id", userId)
      .eq("processada", true)
      .eq("excluida", false);

    if (notasError) throw notasError;

    if (!notas || notas.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "Nenhuma nota processada encontrada", logs }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const candidatos: {
      preco: number;
      data: Date;
      cnpj: string;
      estabelecimento: string;
      origem_nota_id: string;
    }[] = [];

    const normalizarCNPJ = (s?: string | null) => (s || "").replace(/\D/g, "");

    // 3) Extrair candidatos "Preço Pago" das notas
    for (const n of notas) {
      try {
        const dados = n.dados_extraidos as any;
        if (!dados) continue;

        const cnpj = normalizarCNPJ(
          dados?.cnpj ||
            dados?.estabelecimento?.cnpj ||
            dados?.supermercado?.cnpj ||
            dados?.emitente?.cnpj ||
            null
        );

        const estabelecimentoNome =
          dados?.estabelecimento?.nome || dados?.supermercado?.nome || dados?.emitente?.nome || "Desconhecido";

        const { data: dataCompra, hora: horaCompra } = extrairDataHoraCompra(dados);
        const dataIso = construirDataISO(dataCompra, horaCompra) ?? n.created_at;
        const dataCompraDate = new Date(dataIso);

        const itens = Array.isArray(dados?.itens) ? dados.itens : [];
        for (const item of itens) {
          const descricao = (item?.descricao || item?.nome || "").toString();
          const preco = parseFloat(item?.valor_unitario ?? item?.unitPrice ?? item?.preco_unitario ?? "0");
          if (!descricao || !isFinite(preco) || preco <= 0) continue;

          if (verificarSimilaridadeProduto(descricao, produtoNome)) {
            candidatos.push({
              preco,
              data: dataCompraDate,
              cnpj,
              estabelecimento: estabelecimentoNome,
              origem_nota_id: n.id,
            });
          }
        }
      } catch (e) {
        logs.push({ tipo: "ERRO_PARSE_NOTA", nota_id: n.id, erro: String(e) });
      }
    }

    logs.push({ tipo: "INFO", msg: `Candidatos encontrados: ${candidatos.length}` });

    if (candidatos.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "Nenhum item candidato encontrado para o produto", logs }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4) Ordenar cronologicamente e aplicar a regra: atualizar somente se MAIS RECENTE e MENOR
    candidatos.sort((a, b) => a.data.getTime() - b.data.getTime());

    // Descobrir estado atual (para log) considerando o CNPJ do melhor candidato final
    // Mas primeiro vamos simular a evolução temporal
    let estadoAtual: { preco: number; data: Date; cnpj: string; estabelecimento: string } | null = null;
    const decisoes: any[] = [];

    for (const cand of candidatos) {
      if (!estadoAtual) {
        estadoAtual = { preco: cand.preco, data: cand.data, cnpj: cand.cnpj, estabelecimento: cand.estabelecimento };
        decisoes.push({
          produto: produtoNome,
          anterior: null,
          candidato: { preco: cand.preco, data: cand.data.toISOString() },
          decisao: "atualizado (inicial)",
          motivo: "primeiro candidato válido",
          cnpj: cand.cnpj,
        });
        continue;
      }

      if (cand.data > estadoAtual.data && cand.preco < estadoAtual.preco) {
        decisoes.push({
          produto: produtoNome,
          anterior: { preco: estadoAtual.preco, data: estadoAtual.data.toISOString() },
          candidato: { preco: cand.preco, data: cand.data.toISOString() },
          decisao: "atualizado",
          motivo: "mais recente e menor",
          cnpj: cand.cnpj,
        });
        estadoAtual = { preco: cand.preco, data: cand.data, cnpj: cand.cnpj, estabelecimento: cand.estabelecimento };
      } else {
        decisoes.push({
          produto: produtoNome,
          anterior: { preco: estadoAtual.preco, data: estadoAtual.data.toISOString() },
          candidato: { preco: cand.preco, data: cand.data.toISOString() },
          decisao: "mantido",
          motivo:
            cand.data <= estadoAtual.data
              ? "candidato não é mais recente"
              : "candidato não é menor que o atual",
          cnpj: cand.cnpj,
        });
      }
    }

    if (!estadoAtual) {
      return new Response(
        JSON.stringify({ success: false, error: "Falha ao determinar estado atual", logs }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    logs.push({ tipo: "DECISOES", decisoes });

    // 5) Consultar preço existente para o par (produto, cnpj) que venceu
    const { data: precoExistente, error: precoErr } = await supabase
      .from("precos_atuais")
      .select("valor_unitario, data_atualizacao, estabelecimento_nome")
      .eq("produto_nome", produtoNome)
      .eq("estabelecimento_cnpj", estadoAtual.cnpj)
      .maybeSingle();

    if (precoErr) throw precoErr;

    logs.push({
      tipo: "ESTADO_ATUAL_DB",
      produto: produtoNome,
      atual_db: precoExistente
        ? { preco: Number(precoExistente.valor_unitario), data: precoExistente.data_atualizacao }
        : null,
      candidato_final: { preco: estadoAtual.preco, data: estadoAtual.data.toISOString(), cnpj: estadoAtual.cnpj },
    });

    // 6) Upsert obedecendo a regra
    let deveAtualizar = false;
    if (!precoExistente) {
      deveAtualizar = true; // inexistente – cria com melhor candidato
    } else {
      const dataExistente = new Date(precoExistente.data_atualizacao);
      const precoExistenteValor = Number(precoExistente.valor_unitario);
      if (estadoAtual.data > dataExistente && estadoAtual.preco < precoExistenteValor) {
        deveAtualizar = true;
      }
    }

    if (deveAtualizar) {
      const { data: upsertData, error: upErr } = await supabase
        .from("precos_atuais")
        .upsert(
          {
            produto_nome: produtoNome,
            estabelecimento_cnpj: estadoAtual.cnpj,
            estabelecimento_nome: estadoAtual.estabelecimento,
            valor_unitario: estadoAtual.preco,
            data_atualizacao: estadoAtual.data.toISOString(),
          },
          { onConflict: "produto_nome,estabelecimento_cnpj" }
        )
        .select();

      if (upErr) throw upErr;

      logs.push({ tipo: "RESULTADO", decisao: "atualizado", registro: upsertData?.[0] });
    } else {
      logs.push({ tipo: "RESULTADO", decisao: "mantido" });
    }

    return new Response(
      JSON.stringify({ success: true, produto: produtoNome, selecionado: estadoAtual, logs }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Erro no backfill-preco-atual:", error);
    return new Response(
      JSON.stringify({ success: false, error: error?.message || String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function construirDataISO(data?: string | null, hora?: string | null): string | null {
  if (!data) return null;
  // aceita formatos dd/mm/aaaa ou yyyy-mm-dd
  const d = data.includes("/")
    ? data.split("/").reverse().join("-") // dd/mm/aaaa -> aaaa-mm-dd
    : data;
  const h = hora && /^\d{2}:\d{2}(:\d{2})?$/.test(hora) ? hora : "00:00:00";
  return `${d}T${h}`;
}

function extrairDataHoraCompra(dados: any): { data?: string | null; hora?: string | null } {
  // Tenta vários formatos conhecidos dentro de dados_extraidos
  const compra = dados?.compra || dados?.purchase || null;
  if (compra) {
    return {
      data: compra?.data || compra?.date || compra?.emissao || null,
      hora: compra?.hora || compra?.time || null,
    };
  }
  // Alternativas isoladas
  return {
    data: dados?.data || dados?.emissao || dados?.issued_at || null,
    hora: dados?.hora || null,
  };
}

// Mesma ideia de similaridade usada em outras funções do projeto
function verificarSimilaridadeProduto(nome1: string, nome2: string): boolean {
  const normalizar = (nome: string) =>
    nome
      .toUpperCase()
      .normalize("NFD").replace(/\p{Diacritic}/gu, "")
      .trim()
      .replace(/\b(KG|G|GR|ML|L|UN|UNIDADE|LATA|PACOTE|CAIXA|FRASCO|SACO|SACHET|REFIL|\d+G|\d+ML|\d+L|\d+KG)\b/g, "")
      .replace(/\s+/g, " ")
      .trim();

  const n1 = normalizar(nome1);
  const n2 = normalizar(nome2);
  if (n1 === n2) return true;
  if (n1.includes(n2) || n2.includes(n1)) return true;

  const palavras1 = n1.split(" ").filter((p) => p.length > 2);
  const palavras2 = n2.split(" ").filter((p) => p.length > 2);
  let comuns = 0;
  for (const p1 of palavras1) {
    if (palavras2.some((p2) => p2.includes(p1) || p1.includes(p2))) comuns++;
  }
  const percentual = comuns / Math.max(palavras1.length, palavras2.length);
  return percentual >= 0.7;
}
