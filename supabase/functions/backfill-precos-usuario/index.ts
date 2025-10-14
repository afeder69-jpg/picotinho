import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface BackfillUsuarioRequest {
  userId: string;
  produtos?: string[]; // opcional: limitar a um subconjunto
}

// Função auxiliar para detectar produtos multi-unidade (ovos, etc)
function detectarQuantidadeEmbalagem(nomeProduto: string, precoTotal: number) {
  const nomeUpper = nomeProduto.toUpperCase();
  
  // Detectar se é ovo
  if (!nomeUpper.includes('OVO') && !nomeUpper.includes('OVOS')) {
    return { isMultiUnit: false, quantity: 1, unitPrice: precoTotal };
  }
  
  // Padrões para detectar quantidade
  const patterns = [
    /C\/(\d+)/,           // C/30, C/20
    /(\d+)\s*UN(?:IDADE)?S?/i,  // 30UN, 20 UNIDADES
    /BANDEJAS?\s*C\/?\s*(\d+)/i, // BANDEJA C/30
  ];
  
  for (const pattern of patterns) {
    const match = nomeUpper.match(pattern);
    if (match) {
      const qty = parseInt(match[1]);
      if (qty >= 6 && qty <= 100) { // Validação: ovos vêm entre 6 e 100 unidades
        return {
          isMultiUnit: true,
          quantity: qty,
          unitPrice: precoTotal / qty
        };
      }
    }
  }
  
  return { isMultiUnit: false, quantity: 1, unitPrice: precoTotal };
}

interface CandidatoPreco {
  produtoNome: string;
  estabelecimentoCnpj: string;
  estabelecimentoNome: string;
  valorUnitario: number;
  dataAtualizacaoISO: string; // ISO
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = (await req.json()) as BackfillUsuarioRequest;
    const { userId, produtos } = body || {};

    if (!userId) {
      return new Response(
        JSON.stringify({ success: false, error: "Parâmetro userId é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Iniciando backfill de preços (regra: mais recente + menor) para usuário:", userId);

    // 1) Carregar lista de produtos do estoque do usuário (ou usar os fornecidos)
    let produtosAlvo: string[] = produtos ?? [];
    if (!produtosAlvo.length) {
      const { data: itensEstoque, error: erroEstoque } = await supabase
        .from("estoque_app")
        .select("produto_nome")
        .eq("user_id", userId)
        .gt("quantidade", 0);

      if (erroEstoque) {
        console.error("Erro ao buscar estoque:", erroEstoque);
        throw erroEstoque;
      }

      produtosAlvo = Array.from(new Set((itensEstoque ?? []).map((i) => i.produto_nome))).filter(Boolean);
    }

    console.log(`Produtos a processar: ${produtosAlvo.length}`);

    // 2) Buscar todas as notas do usuário (uma vez) para otimizar
    const { data: notas, error: erroNotas } = await supabase
      .from("notas_imagens")
      .select("id, dados_extraidos, created_at")
      .eq("usuario_id", userId)
      .eq("processada", true)
      .not("dados_extraidos", "is", null);

    if (erroNotas) {
      console.error("Erro ao buscar notas:", erroNotas);
      throw erroNotas;
    }

    const logs: any[] = [];
    let totalAtualizados = 0;
    let totalMantidos = 0;
    let totalSemCandidatos = 0;

    // 3) Para cada produto, extrair candidatos e aplicar regra combinada
    for (const produtoNome of produtosAlvo) {
      try {
        const candidatos: CandidatoPreco[] = [];

        for (const nota of notas ?? []) {
          const dados = nota.dados_extraidos || {};
          const { data, hora } = extrairDataHoraCompra(dados);
          const dataISO = construirDataISO(data, hora) ?? new Date(nota.created_at).toISOString();

          // Extrair CNPJ e nome do estabelecimento
          const { cnpj: cnpjLimp, nome: estabNome } = extrairEstabelecimento(dados);
          if (!cnpjLimp) continue; // precisamos do CNPJ para precos_atuais

          // Iterar itens
          const itens = Array.isArray(dados?.itens) ? dados.itens : dados?.compra?.itens ?? [];
          for (const item of itens) {
            const desc = normalizarTexto(item?.descricao ?? item?.nome ?? "");
            const alvo = normalizarTexto(produtoNome);
            const unidade = (item?.unidade ?? item?.un ?? item?.medida ?? "UN").toString().toUpperCase();
            let valorUnit = Number(item?.valor_unitario ?? item?.preco_unitario ?? 0);

            if (!desc || valorUnit <= 0) continue;

            // 🥚 Aplicar lógica de detecção de ovos
            const nomeOriginal = item?.descricao ?? item?.nome ?? "";
            const embalagem = detectarQuantidadeEmbalagem(nomeOriginal, valorUnit);
            if (embalagem.isMultiUnit) {
              valorUnit = embalagem.unitPrice;
              console.log(`🥚 BACKFILL - OVO DETECTADO: ${nomeOriginal} → ${embalagem.quantity} unidades @ R$ ${valorUnit.toFixed(3)}`);
            }

            if (verificarSimilaridadeProduto(desc, alvo)) {
              candidatos.push({
                produtoNome: produtoNome,
                estabelecimentoCnpj: cnpjLimp,
                estabelecimentoNome: estabNome || "DESCONHECIDO",
                valorUnitario: valorUnit,
                dataAtualizacaoISO: dataISO,
              });

              // Log adicional para ovos
              if (nomeOriginal.toUpperCase().includes('OVO')) {
                console.log(`🥚 BACKFILL OVO: "${produtoNome}" = R$ ${valorUnit.toFixed(3)}/un`);
              }
            }
          }
        }

        if (!candidatos.length) {
          totalSemCandidatos++;
          logs.push({ produto: produtoNome, status: "SEM_CANDIDATOS" });
          continue;
        }

        // 3.1) Consolidar por estabelecimento aplicando a regra (cronológica + menor preço)
        const porEstab = new Map<string, CandidatoPreco>();

        // Ordenar candidatos por data crescente
        candidatos.sort((a, b) => new Date(a.dataAtualizacaoISO).getTime() - new Date(b.dataAtualizacaoISO).getTime());

        for (const cand of candidatos) {
          const chave = `${cand.estabelecimentoCnpj}`;
          const atual = porEstab.get(chave);
          if (!atual) {
            porEstab.set(chave, cand);
          } else {
            const dataCand = new Date(cand.dataAtualizacaoISO).getTime();
            const dataAtual = new Date(atual.dataAtualizacaoISO).getTime();
            if (dataCand > dataAtual && cand.valorUnitario < atual.valorUnitario) {
              porEstab.set(chave, cand);
            }
          }
        }

        // 3.2) Para cada estabelecimento, comparar com precos_atuais e decidir upsert
        for (const [, melhor] of porEstab) {
          const { data: existente } = await supabase
            .from("precos_atuais")
            .select("id, valor_unitario, data_atualizacao")
            .eq("produto_nome", produtoNome)
            .eq("estabelecimento_cnpj", melhor.estabelecimentoCnpj)
            .maybeSingle();

          let deveAtualizar = false;
          if (!existente) {
            // se não existe, criamos diretamente com o melhor candidato
            deveAtualizar = true;
          } else {
            const dataExist = new Date(existente.data_atualizacao).getTime();
            const dataNova = new Date(melhor.dataAtualizacaoISO).getTime();
            const precoExist = Number(existente.valor_unitario);
            const precoNovo = Number(melhor.valorUnitario);
            if (dataNova > dataExist && precoNovo < precoExist) {
              deveAtualizar = true;
            }
          }

          if (deveAtualizar) {
            const { error: erroUpsert } = await supabase
              .from("precos_atuais")
              .upsert(
                {
                  produto_nome: produtoNome,
                  estabelecimento_cnpj: melhor.estabelecimentoCnpj,
                  estabelecimento_nome: melhor.estabelecimentoNome,
                  valor_unitario: melhor.valorUnitario,
                  data_atualizacao: melhor.dataAtualizacaoISO,
                },
                { onConflict: "produto_nome,estabelecimento_cnpj" }
              );

            if (erroUpsert) {
              logs.push({ produto: produtoNome, estab: melhor.estabelecimentoCnpj, status: "ERRO_UPSERT", erro: erroUpsert.message });
            } else {
              totalAtualizados++;
              logs.push({ produto: produtoNome, estab: melhor.estabelecimentoCnpj, status: "ATUALIZADO", preco: melhor.valorUnitario, data: melhor.dataAtualizacaoISO });
            }
          } else {
            totalMantidos++;
            logs.push({ produto: produtoNome, estab: melhor.estabelecimentoCnpj, status: "MANTIDO" });
          }
        }
      } catch (err) {
        console.error("Erro ao processar produto:", produtoNome, err);
        logs.push({ produto: produtoNome, status: "ERRO_PROCESSAMENTO", erro: (err as Error).message });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        userId,
        produtosProcessados: produtosAlvo.length,
        totalAtualizados,
        totalMantidos,
        totalSemCandidatos,
        logs,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Erro no backfill-precos-usuario:", error);
    return new Response(
      JSON.stringify({ success: false, error: error?.message ?? "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function normalizarTexto(txt: string): string {
  return (txt || "")
    .toUpperCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remover acentos
    .trim()
    .replace(/\b(KG|G|ML|L|UN|UNIDADE|LATA|PACOTE|CAIXA|FRASCO|SACHE|SACHET|\d+G|\d+ML|\d+L|\d+KG)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function verificarSimilaridadeProduto(nome1: string, nome2: string): boolean {
  const n1 = normalizarTexto(nome1);
  const n2 = normalizarTexto(nome2);
  if (!n1 || !n2) return false;
  if (n1 === n2) return true;
  if (n1.includes(n2) || n2.includes(n1)) return true;

  const p1 = n1.split(" ").filter((p) => p.length > 2);
  const p2 = n2.split(" ").filter((p) => p.length > 2);
  let comuns = 0;
  for (const a of p1) {
    if (p2.some((b) => b.includes(a) || a.includes(b))) comuns++;
  }
  const perc = comuns / Math.max(p1.length, p2.length);
  return perc >= 0.7;
}

function construirDataISO(data?: string | null, hora?: string | null): string | null {
  try {
    if (!data && !hora) return null;
    // aceita formatos DD/MM/YYYY ou YYYY-MM-DD
    let dateStr = data ?? "";
    if (dateStr && /^(\d{2})\/(\d{2})\/(\d{4})$/.test(dateStr)) {
      const [d, m, y] = dateStr.split("/");
      dateStr = `${y}-${m}-${d}`;
    }
    const iso = new Date(`${dateStr}T${hora ?? "00:00:00"}`).toISOString();
    return iso;
  } catch {
    return null;
  }
}

function extrairDataHoraCompra(dados: any): { data?: string | null; hora?: string | null } {
  const compra = dados?.compra ?? dados?.nota ?? dados ?? {};
  const data = compra?.data_compra ?? compra?.data ?? compra?.emissao ?? dados?.data ?? null;
  const hora = compra?.hora_compra ?? compra?.hora ?? null;
  return { data, hora };
}

function extrairEstabelecimento(dados: any): { cnpj: string | null; nome: string | null } {
  const fontes = [
    dados?.estabelecimento,
    dados?.supermercado,
    dados?.emitente,
    dados,
  ].filter(Boolean);

  let cnpj: string | null = null;
  let nome: string | null = null;

  for (const f of fontes) {
    const c = (f?.cnpj ?? f?.cnpj_emitente ?? f?.CNPJ ?? null) as string | null;
    const n = (f?.nome ?? f?.razao_social ?? f?.fantasia ?? null) as string | null;
    if (!cnpj && c) cnpj = (c || "").replace(/\D/g, "");
    if (!nome && n) nome = String(n).toUpperCase();
    if (cnpj && nome) break;
  }

  return { cnpj, nome };
}
