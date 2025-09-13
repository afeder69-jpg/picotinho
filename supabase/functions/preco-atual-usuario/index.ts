import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RequestBody {
  userId: string;
  latitude: number;
  longitude: number;
  raioKm?: number; // opcional: se não vier, usa configuracoes_usuario
}

interface PrecoResultado {
  produto_nome: string;
  valor_unitario: number;
  data_atualizacao: string;
  estabelecimento_cnpj: string;
  estabelecimento_nome: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = (await req.json()) as RequestBody;
    const { userId, latitude, longitude, raioKm } = body || {};

    if (!userId || latitude == null || longitude == null) {
      return new Response(
        JSON.stringify({ success: false, error: "Parâmetros inválidos: userId, latitude e longitude são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1) Carregar raio de atuação do usuário (se não informado)
    let raio = Number(raioKm);
    if (!raio || Number.isNaN(raio) || raio <= 0) {
      const { data: config } = await supabase
        .from("configuracoes_usuario")
        .select("raio_busca_km")
        .eq("usuario_id", userId)
        .maybeSingle();
      raio = Number(config?.raio_busca_km ?? 5.0);
    }

    console.log(`🔎 Calculando Preço Atual por área | user=${userId} | raio=${raio}km | lat=${latitude} | lon=${longitude}`);

    // 2) Buscar estoque do usuário (apenas itens com quantidade > 0)
    const { data: estoque, error: estoqueErr } = await supabase
      .from("estoque_app")
      .select("id, produto_nome, quantidade")
      .eq("user_id", userId)
      .gt("quantidade", 0);

    if (estoqueErr) throw estoqueErr;

    // 3) Buscar supermercados com coordenadas e filtrar por raio
    const { data: supermercados, error: mercadosErr } = await supabase
      .from("supermercados")
      .select("id, nome, cnpj, latitude, longitude, ativo")
      .eq("ativo", true)
      .not("latitude", "is", null)
      .not("longitude", "is", null);

    if (mercadosErr) throw mercadosErr;

    const calcularDistancia = (lat1: number, lon1: number, lat2: number, lon2: number) => {
      const R = 6371; // km
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) *
                Math.sin(dLon/2) * Math.sin(dLon/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      return R * c;
    };

    const cnpjsNoRaio = new Set<string>();
    const cnpjParaInfo = new Map<string, { nome: string }>();

    for (const s of supermercados ?? []) {
      const lat = parseFloat(String(s.latitude));
      const lon = parseFloat(String(s.longitude));
      const dist = calcularDistancia(latitude, longitude, lat, lon);
      if (dist <= raio) {
        const cnpjLimpo = (s.cnpj || "").replace(/[^\d]/g, "");
        if (cnpjLimpo) {
          cnpjsNoRaio.add(cnpjLimpo);
          cnpjParaInfo.set(cnpjLimpo, { nome: s.nome || "Estabelecimento" });
        }
      }
    }

    console.log(`📍 Supermercados dentro do raio: ${cnpjsNoRaio.size}`);
    if (cnpjsNoRaio.size === 0) {
      return new Response(
        JSON.stringify({ success: true, raio, resultados: [] as PrecoResultado[] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4) Buscar todos os preços atuais dos CNPJs no raio
    const { data: precosArea, error: precosErr } = await supabase
      .from("precos_atuais")
      .select("produto_nome, estabelecimento_cnpj, estabelecimento_nome, valor_unitario, data_atualizacao");

    if (precosErr) throw precosErr;

    // Filtrar por CNPJ no raio (normalizando)
    const candidatos = (precosArea ?? []).filter(p => {
      const cnpj = (p.estabelecimento_cnpj || "").replace(/[^\d]/g, "");
      return cnpjsNoRaio.has(cnpj);
    });

    // 5) Para cada produto do estoque, encontrar o preço conforme a regra: "sempre o menor valor mais recente"
    const resultados: PrecoResultado[] = [];

    const normalizarTexto = (txt: string) => (txt || "")
      .toUpperCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .trim()
      .replace(/\b(KG|G|ML|L|UN|UNIDADE|LATA|PACOTE|CAIXA|FRASCO|SACHE|SACHET|\d+G|\d+ML|\d+L|\d+KG)\b/g, "")
      .replace(/\s+/g, " ")
      .trim();

    for (const item of estoque ?? []) {
      const alvo = normalizarTexto(item.produto_nome);
      const candidatosProduto = candidatos.filter(p => normalizarTexto(p.produto_nome) === alvo);

      if (!candidatosProduto.length) continue;

      // Encontrar a data mais recente (por dia)
      const datas = candidatosProduto.map(c => new Date(c.data_atualizacao));
      const maxTime = Math.max(...datas.map(d => new Date(d.toISOString().slice(0,10)).getTime()));

      // Selecionar apenas os da data mais recente (considerando o dia)
      const doDiaMaisRecente = candidatosProduto.filter(c => {
        const day = new Date(new Date(c.data_atualizacao).toISOString().slice(0,10)).getTime();
        return day === maxTime;
      });

      // Dentre eles, pegar o menor valor
      const melhor = doDiaMaisRecente.reduce((best, cur) => Number(cur.valor_unitario) < Number(best.valor_unitario) ? cur : best);

      const cnpjLimpo = (melhor.estabelecimento_cnpj || "").replace(/[^\d]/g, "");
      resultados.push({
        produto_nome: item.produto_nome,
        valor_unitario: Number(melhor.valor_unitario),
        data_atualizacao: melhor.data_atualizacao,
        estabelecimento_cnpj: cnpjLimpo,
        estabelecimento_nome: melhor.estabelecimento_nome || cnpjParaInfo.get(cnpjLimpo)?.nome || "Estabelecimento",
      });
    }

    console.log(`✅ Produtos com preço encontrado no raio: ${resultados.length}`);

    return new Response(
      JSON.stringify({ success: true, raio, resultados }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Erro em preco-atual-usuario:", error);
    return new Response(
      JSON.stringify({ success: false, error: error?.message ?? "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
