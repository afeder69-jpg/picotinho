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
    console.log(`📦 Produtos no estoque: ${estoque?.length || 0}`);

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

    // 4) Buscar todas as notas fiscais processadas do usuário 
    const { data: notasUsuario, error: notasErr } = await supabase
      .from("notas_imagens")
      .select("dados_extraidos, data_criacao")
      .eq("usuario_id", userId)
      .eq("processada", true)
      .not("dados_extraidos", "is", null);

    if (notasErr) throw notasErr;
    console.log(`📄 Notas fiscais processadas encontradas: ${notasUsuario?.length || 0}`);

    // 5) Extrair produtos das notas que são de estabelecimentos no raio
    const candidatos: Array<{
      produto_nome: string;
      valor_unitario: number;
      data_atualizacao: string;
      estabelecimento_cnpj: string;
      estabelecimento_nome: string;
    }> = [];

    for (const nota of notasUsuario ?? []) {
      const dados = nota.dados_extraidos;
      if (!dados?.itens) continue;

      // Extrair CNPJ da nota (verificando múltiplas possibilidades)
      let cnpjNota = "";
      if (dados.cnpj) cnpjNota = dados.cnpj;
      else if (dados.estabelecimento?.cnpj) cnpjNota = dados.estabelecimento.cnpj;
      else if (dados.supermercado?.cnpj) cnpjNota = dados.supermercado.cnpj;
      else if (dados.emitente?.cnpj) cnpjNota = dados.emitente.cnpj;
      
      cnpjNota = (cnpjNota || "").replace(/[^\d]/g, "");

      // ✅ CORREÇÃO CRÍTICA: Extrair data REAL da compra da nota fiscal
      let dataRealCompra = "";
      if (dados.compra?.data_emissao) dataRealCompra = dados.compra.data_emissao;
      else if (dados.compra?.data_compra) dataRealCompra = dados.compra.data_compra;
      else if (dados.dataCompra) dataRealCompra = dados.dataCompra;
      else if (dados.data_emissao) dataRealCompra = dados.data_emissao;
      else if (dados.data_compra) dataRealCompra = dados.data_compra;
      
      // Se não conseguir extrair data da nota, usar data de criação como fallback
      if (!dataRealCompra) {
        console.log(`⚠️ Data da compra não encontrada na nota, usando data de criação como fallback`);
        dataRealCompra = nota.data_criacao;
      }

      // ✅ NOVA CORREÇÃO: Converter para formato ISO válido
      let dataRealCompraISO = "";
      try {
        // Se já está em formato ISO, usar direto
        if (dataRealCompra.includes('T')) {
          dataRealCompraISO = new Date(dataRealCompra).toISOString();
        } else if (dataRealCompra.includes('/')) {
          // Formato DD/MM/YYYY HH:MM:SS
          const [datePart, timePart] = dataRealCompra.split(' ');
          const [dia, mes, ano] = datePart.split('/');
          const horaFormatada = timePart || '00:00:00';
          dataRealCompraISO = new Date(`${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}T${horaFormatada}`).toISOString();
        } else {
          // Fallback para data atual se não conseguir parsear
          dataRealCompraISO = new Date().toISOString();
        }
      } catch (error) {
        console.error(`❌ Erro ao converter data: ${dataRealCompra}`, error);
        dataRealCompraISO = new Date().toISOString();
      }

      console.log(`🧾 Nota com CNPJ: ${cnpjNota}, Data Real da Compra: ${dataRealCompra}, ISO: ${dataRealCompraISO}, Estabelecimento: ${dados.estabelecimento?.nome || 'Não identificado'}`);

      // Verificar se o estabelecimento está no raio
      if (!cnpjsNoRaio.has(cnpjNota)) continue;

      const nomeEstabelecimento = cnpjParaInfo.get(cnpjNota)?.nome || 
        dados.estabelecimento?.nome || 
        dados.supermercado?.nome || 
        dados.emitente?.nome || 
        "Estabelecimento";

      // Extrair itens da nota
      for (const item of dados.itens) {
        const valorUnitario = Number(item.valor_unitario || item.preco_unitario || 0);
        if (!item.descricao || valorUnitario <= 0) continue;

        candidatos.push({
          produto_nome: item.descricao,
          valor_unitario: valorUnitario,
          data_atualizacao: dataRealCompraISO, // ✅ CORRIGIDO: usando data ISO válida
          estabelecimento_cnpj: cnpjNota,
          estabelecimento_nome: nomeEstabelecimento,
        });
      }
    }

    console.log(`🏪 Candidatos de produtos encontrados: ${candidatos.length}`);
    console.log(`💰 Amostra de candidatos:`, candidatos.slice(0, 3).map(c => ({
      produto: c.produto_nome,
      valor: c.valor_unitario,
      data: c.data_atualizacao,
      estabelecimento: c.estabelecimento_nome
    })));

    // 6) Para cada produto do estoque, encontrar o preço conforme a regra: "sempre o menor valor mais recente"
    const resultados: PrecoResultado[] = [];

    const normalizarTexto = (txt: string) => {
      return (txt || "")
        .toUpperCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Remove acentos
        .trim()
        // Normalizar abreviações específicas PRIMEIRO
        .replace(/\bCOZ\b/g, "COZIDO")
        .replace(/\bFATIADO\b/g, "")
        // Remover números e unidades de medida
        .replace(/\b(\d+(?:[\.,]\d+)?\s*(KG|G|ML|L|UN|UNIDADE|LATA|PACOTE|CAIXA|FRASCO|SACHE|SACHET|BANDEJA))\b/g, "")
        .replace(/\b(KG|G|ML|L|UN|UNIDADE|LATA|PACOTE|CAIXA|FRASCO|SACHE|SACHET|BANDEJA)\b/g, "")
        // Remover números soltos
        .replace(/\b\d+(?:[\.,]\d+)?\b/g, "")
        // Normalizar IOG para IOGURTE
        .replace(/\bIOG\b/g, "IOGURTE")
        .replace(/\bIOG LACFREE\b/g, "IOGURTE LACFREE")
        .replace(/\bIOG LIQUIDO\b/g, "IOGURTE LIQUIDO")
        .replace(/\bIOG LÍQUIDO\b/g, "IOGURTE LIQUIDO")
        // Normalizar SABÃO YPE (TIXAN YPE -> YPE)
        .replace(/\bTIXAN\s*YPE\b/g, "YPE")
        .replace(/\bSABAO\s*EM\s*PO\b/g, "SABAO EM PO")
        // Normalizar RUCULA/RÚCULA
        .replace(/\bRUCULA\b/g, "RUCULA")
        .replace(/\bRÚCULA\b/g, "RUCULA")
        // Normalizar espaços múltiplos
        .replace(/\s+/g, " ")
        .trim();
    };

    // Função para calcular similaridade entre palavras
    const calcularSimilaridadePalavras = (texto1: string, texto2: string): number => {
      const palavras1 = texto1.split(' ').filter(p => p.length > 2);
      const palavras2 = texto2.split(' ').filter(p => p.length > 2);
      
      if (palavras1.length === 0 || palavras2.length === 0) return 0;
      
      let palavrasComuns = 0;
      palavras1.forEach(palavra => {
        if (palavras2.some(p => p.includes(palavra) || palavra.includes(p))) {
          palavrasComuns++;
        }
      });
      
      return palavrasComuns / Math.max(palavras1.length, palavras2.length);
    };

    for (const item of estoque ?? []) {
      const alvo = normalizarTexto(item.produto_nome);
      console.log(`🔍 Buscando preços para: ${item.produto_nome} (normalizado: ${alvo})`);
      
      const candidatosProduto = candidatos.filter(p => {
        const pNormalizado = normalizarTexto(p.produto_nome);
        
        // Múltiplas tentativas de matching
        const match = 
          // 1. Match exato
          pNormalizado === alvo ||
          // 2. Um contém o outro (mínimo 3 caracteres)
          (alvo.length >= 3 && pNormalizado.includes(alvo)) ||
          (pNormalizado.length >= 3 && alvo.includes(pNormalizado)) ||
          // 3. Verificar palavras-chave em comum (similaridade)
          calcularSimilaridadePalavras(alvo, pNormalizado) >= 0.6;
        
        if (match) {
          console.log(`  ✅ Match encontrado: ${p.produto_nome} (${p.valor_unitario}) - ${p.data_atualizacao} - ${p.estabelecimento_nome}`);
        }
        return match;
      });

      if (!candidatosProduto.length) {
        console.log(`  ❌ Nenhum candidato encontrado para: ${item.produto_nome}`);
        continue;
      }

      console.log(`  📊 ${candidatosProduto.length} candidatos encontrados para ${item.produto_nome}`);

      // Ordenar por data decrescente primeiro (mais recente primeiro)
      candidatosProduto.sort((a, b) => new Date(b.data_atualizacao).getTime() - new Date(a.data_atualizacao).getTime());
      
      // Encontrar a data mais recente
      const dataMaisRecente = candidatosProduto[0].data_atualizacao;
      const dataMaisRecenteStr = new Date(dataMaisRecente).toISOString().slice(0,10);
      
      console.log(`  📅 Data mais recente encontrada: ${dataMaisRecenteStr}`);

      // Selecionar apenas os da data mais recente (considerando o dia)
      const doDiaMaisRecente = candidatosProduto.filter(c => {
        const dataCandidata = new Date(c.data_atualizacao).toISOString().slice(0,10);
        return dataCandidata === dataMaisRecenteStr;
      });

      console.log(`  🎯 ${doDiaMaisRecente.length} candidatos da data mais recente (${dataMaisRecenteStr})`);

      // Dentre eles, pegar o menor valor
      const melhor = doDiaMaisRecente.reduce((best, cur) => {
        const valorCur = Number(cur.valor_unitario);
        const valorBest = Number(best.valor_unitario);
        console.log(`    💰 Comparando: ${cur.valor_unitario} vs ${best.valor_unitario}`);
        return valorCur < valorBest ? cur : best;
      });

      console.log(`  🏆 Melhor preço selecionado: ${melhor.produto_nome} = R$ ${melhor.valor_unitario} (${melhor.estabelecimento_nome})`);

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

    // 7) Buscar preços existentes na tabela precos_atuais para produtos do estoque
    // que não foram encontrados nas notas do usuário
    console.log('🔍 Buscando preços gerais existentes para produtos sem preço das notas...');
    
    for (const item of estoque ?? []) {
      // Verificar se o produto já tem resultado
      const jaTemResultado = resultados.some(r => r.produto_nome === item.produto_nome);
      if (jaTemResultado) continue;
      
      console.log(`🔍 Buscando preço geral para: ${item.produto_nome}`);
      
      // Buscar na tabela precos_atuais preços existentes de estabelecimentos na área
      const { data: precosGerais, error: precosErr } = await supabase
        .from('precos_atuais')
        .select('*')
        .in('estabelecimento_cnpj', Array.from(cnpjsNoRaio))
        .order('data_atualizacao', { ascending: false });
      
      if (precosErr) {
        console.error('Erro ao buscar preços gerais:', precosErr);
        continue;
      }
      
      // Normalizar e encontrar matches
      const alvo = normalizarTexto(item.produto_nome);
      const candidatosGerais = (precosGerais || []).filter(p => {
        const pNormalizado = normalizarTexto(p.produto_nome);
        
        // Mesma lógica de matching melhorada
        const match = 
          pNormalizado === alvo ||
          (alvo.length >= 3 && pNormalizado.includes(alvo)) ||
          (pNormalizado.length >= 3 && alvo.includes(pNormalizado)) ||
          calcularSimilaridadePalavras(alvo, pNormalizado) >= 0.6;
        
        if (match) {
          console.log(`  ✅ Preço geral encontrado: ${p.produto_nome} (${p.valor_unitario}) - ${p.estabelecimento_nome}`);
        }
        return match;
      });
      
      if (candidatosGerais.length > 0) {
        // Pegar o mais recente
        const melhor = candidatosGerais[0];
        resultados.push({
          produto_nome: item.produto_nome,
          valor_unitario: Number(melhor.valor_unitario),
          data_atualizacao: melhor.data_atualizacao,
          estabelecimento_cnpj: melhor.estabelecimento_cnpj,
          estabelecimento_nome: melhor.estabelecimento_nome,
        });
        console.log(`💰 Preço geral adicionado: ${item.produto_nome} = R$ ${melhor.valor_unitario}`);
      }
    }

    // 8) Salvar/atualizar os preços na tabela precos_atuais (apenas novos das notas)
    for (const resultado of resultados) {
      try {
        const { error: upsertError } = await supabase
          .from('precos_atuais')
          .upsert({
            produto_nome: resultado.produto_nome,
            valor_unitario: resultado.valor_unitario,
            data_atualizacao: resultado.data_atualizacao,
            estabelecimento_cnpj: resultado.estabelecimento_cnpj,
            estabelecimento_nome: resultado.estabelecimento_nome,
            produto_codigo: null
          }, {
            onConflict: 'produto_nome,estabelecimento_cnpj'
          });

        if (upsertError) {
          console.error(`Erro ao atualizar preço de ${resultado.produto_nome}:`, upsertError);
        } else {
          console.log(`💾 Preço atualizado: ${resultado.produto_nome} = R$ ${resultado.valor_unitario}`);
        }
      } catch (error) {
        console.error(`Erro ao processar ${resultado.produto_nome}:`, error);
      }
    }

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
