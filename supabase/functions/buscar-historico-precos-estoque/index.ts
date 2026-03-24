import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function normalizarNomeProduto(nome: string): string {
  let normalizado = nome.toLowerCase().trim().replace(/\s+/g, ' ');
  normalizado = normalizado.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const palavrasRemover = [
    'kg', 'granel', 'unidade', 'un', 'super', 'extra',
    'tradicional', 'classico', 'trad', 'trad.', 'gra.', 'gra',
    'quilograma', 'quilogramas'
  ];
  for (const palavra of palavrasRemover) {
    const regex = new RegExp(`\\b${palavra}\\b`, 'gi');
    normalizado = normalizado.replace(regex, '');
  }
  const abreviacoes: { [key: string]: string } = {
    's/lac': 'sem lactose', 'c/lac': 'com lactose', 's/lactose': 'sem lactose',
    'c/sal': 'com sal', 's/sal': 'sem sal', 'pct': 'pacote', 'cx': 'caixa',
    'lt': 'litro', 'ml': 'mililitro', 'gr': 'grama', 'pc': 'peca', 'peca': 'peca'
  };
  for (const [abrev, completo] of Object.entries(abreviacoes)) {
    const regex = new RegExp(`\\b${abrev}\\b`, 'gi');
    normalizado = normalizado.replace(regex, completo);
  }
  normalizado = normalizado.replace(/[^a-z0-9\s.]/g, ' ');
  normalizado = normalizado.replace(/\s+/g, ' ').trim();
  return normalizado;
}

interface RegraConversao {
  produto_pattern: string;
  produto_exclusao_pattern: string | null;
  ean_pattern: string | null;
  tipo_embalagem: string;
  qtd_por_embalagem: number;
  unidade_consumo: string;
  prioridade: number;
}

interface ResultadoEmbalagem {
  isMultiUnit: boolean;
  quantity: number;
  unitPrice: number;
  tipo_embalagem: string | null;
  unidade_consumo: string;
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const sanitized = value.replace(/R\$/gi, '').replace(/\s+/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
    const parsed = Number(sanitized);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function detectarQuantidadeEmbalagem(
  nomeProduto: string, precoTotal: number, regras: RegraConversao[], eanProduto?: string | null
): ResultadoEmbalagem {
  const nomeUpper = nomeProduto.toUpperCase();
  const fallback: ResultadoEmbalagem = { isMultiUnit: false, quantity: 1, unitPrice: precoTotal, tipo_embalagem: null, unidade_consumo: 'UN' };
  if (!regras || regras.length === 0) return fallback;

  if (eanProduto) {
    for (const regra of regras) {
      if (!regra.ean_pattern) continue;
      try {
        if (!new RegExp(regra.ean_pattern, 'i').test(eanProduto)) continue;
        if (regra.produto_exclusao_pattern && new RegExp(regra.produto_exclusao_pattern, 'i').test(nomeUpper)) continue;
        const qty = regra.qtd_por_embalagem;
        if (qty > 1 && qty <= 100) return { isMultiUnit: true, quantity: qty, unitPrice: precoTotal / qty, tipo_embalagem: regra.tipo_embalagem, unidade_consumo: regra.unidade_consumo };
      } catch (e) { console.warn('Regex EAN inválido:', regra.ean_pattern, e); }
    }
  }

  for (const regra of regras) {
    try {
      if (!new RegExp(regra.produto_pattern, 'i').test(nomeUpper)) continue;
      if (regra.produto_exclusao_pattern && new RegExp(regra.produto_exclusao_pattern, 'i').test(nomeUpper)) continue;
      const qty = regra.qtd_por_embalagem;
      if (qty > 1 && qty <= 100) return { isMultiUnit: true, quantity: qty, unitPrice: precoTotal / qty, tipo_embalagem: regra.tipo_embalagem, unidade_consumo: regra.unidade_consumo };
    } catch (e) { console.warn('Regex nome inválido:', regra.produto_pattern, e); }
  }

  return fallback;
}

function calcularDistancia(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLon/2) * Math.sin(dLon/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function extrairDataCompra(dados: any): string | null {
  const possiveisCampos = [
    dados.compra?.data_emissao, dados.compra?.data_compra,
    dados.dataCompra, dados.data_emissao, dados.data_compra
  ];
  for (const campo of possiveisCampos) {
    if (!campo) continue;
    try {
      let dataTemp;
      if (typeof campo === 'string') {
        const dataLimpa = campo.replace(/[-+]\d{2}:\d{2}$/, '');
        dataTemp = new Date(dataLimpa);
      } else {
        dataTemp = new Date(campo);
      }
      if (!isNaN(dataTemp.getTime()) && dataTemp.getFullYear() > 2020) return dataTemp.toISOString();
    } catch (_) { continue; }
  }
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    const { produtos, userId, latitude, longitude, raioKm } = await req.json();

    if (!produtos || !Array.isArray(produtos) || produtos.length === 0 || !userId) {
      return new Response(JSON.stringify({ success: false, error: 'Parâmetros inválidos' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log(`🔍 Buscando histórico BATCH para ${produtos.length} produtos | user=${userId}`);

    // 1) Carregar regras de embalagem (1 query)
    const { data: regrasConversao } = await supabase
      .from('regras_conversao_embalagem')
      .select('produto_pattern, produto_exclusao_pattern, ean_pattern, tipo_embalagem, qtd_por_embalagem, unidade_consumo, prioridade')
      .eq('ativo', true).eq('tipo_conversao', 'fixa').order('prioridade', { ascending: true });
    const regrasEmbalagem: RegraConversao[] = (regrasConversao || []) as RegraConversao[];

    // 2) Buscar estoque do usuário para obter produto_nome_normalizado e master_id (1 query)
    const produtoIds = produtos.map(p => typeof p === 'object' ? p.id : null).filter(Boolean);
    let estoqueMap = new Map<string, any>();
    
    if (produtoIds.length > 0) {
      const { data: estoqueData } = await supabase
        .from('estoque_app')
        .select('id, produto_nome, produto_nome_normalizado, produto_master_id')
        .eq('user_id', userId)
        .in('id', produtoIds);
      
      (estoqueData || []).forEach(e => estoqueMap.set(e.id, e));
    }

    // 3) Buscar TODAS as notas do usuário UMA VEZ (janela de 6 meses para performance)
    const seisAtras = new Date();
    seisAtras.setMonth(seisAtras.getMonth() - 6);
    
    const { data: notasUsuario, error: notasErr } = await supabase
      .from('notas_imagens')
      .select('dados_extraidos, created_at')
      .eq('usuario_id', userId)
      .eq('processada', true)
      .not('dados_extraidos', 'is', null)
      .gte('created_at', seisAtras.toISOString())
      .order('created_at', { ascending: false })
      .limit(200);

    if (notasErr) console.warn('⚠️ Erro ao buscar notas:', notasErr.message);
    console.log(`📄 Notas carregadas: ${notasUsuario?.length || 0}`);

    // 4) Pré-processar TODOS os itens de notas em um array flat (1 passagem)
    interface ItemNota {
      nomeOriginal: string;
      nomeNormalizado: string;
      precoUnitario: number;
      quantidade: number;
      dataCompra: string;
      ean: string | null;
    }
    
    const todosItensNotas: ItemNota[] = [];
    for (const nota of notasUsuario || []) {
      const dados = nota.dados_extraidos as any;
      if (!dados?.itens) continue;
      const dataCompra = extrairDataCompra(dados) || nota.created_at;
      if (!dataCompra) continue;

      for (const item of dados.itens) {
        const nomeOriginal = item.descricao || item.nome || '';
        if (!nomeOriginal) continue;
        const precoUnitario = toNumber(item.valor_unitario || item.preco_unitario || 0);
        const quantidade = toNumber(item.quantidade || 1);
        if (precoUnitario <= 0 || quantidade <= 0) continue;

        todosItensNotas.push({
          nomeOriginal,
          nomeNormalizado: normalizarNomeProduto(nomeOriginal),
          precoUnitario,
          quantidade,
          dataCompra,
          ean: item.codigo_barras || item.ean || item.ean_comercial || null
        });
      }
    }
    console.log(`📦 Total itens pré-processados: ${todosItensNotas.length}`);

    // 5) Para cada produto, buscar match no array pré-processado (sem queries adicionais)
    const resultado = [];

    for (const produtoData of produtos) {
      const produtoNome = typeof produtoData === 'string' ? produtoData : produtoData.produto_nome;
      const produtoId = typeof produtoData === 'object' ? produtoData.id : null;

      const estoqueInfo = produtoId ? estoqueMap.get(produtoId) : null;
      
      if (!estoqueInfo?.produto_master_id) {
        resultado.push({ id: produtoId, produto: produtoNome, ultimaCompraUsuario: null, menorPrecoArea: null, erro: 'Produto não normalizado' });
        continue;
      }

      // ✅ CORREÇÃO: Normalizar SEMPRE antes de comparar (case-insensitive)
      const produtoNormalizado = normalizarNomeProduto(estoqueInfo.produto_nome_normalizado || estoqueInfo.produto_nome || produtoNome);

      // Buscar matches no array pré-processado
      let ultimaCompraDoUsuario: { data: string; preco: number; quantidade: number } | null = null;

      for (const itemNota of todosItensNotas) {
        const match = itemNota.nomeNormalizado.includes(produtoNormalizado) || produtoNormalizado.includes(itemNota.nomeNormalizado);
        if (!match) continue;

        const valorTotalItem = itemNota.precoUnitario * itemNota.quantidade;
        const embalagem = detectarQuantidadeEmbalagem(itemNota.nomeOriginal, itemNota.precoUnitario, regrasEmbalagem, itemNota.ean);
        const quantidadeFinal = embalagem.isMultiUnit ? itemNota.quantidade * embalagem.quantity : itemNota.quantidade;
        const precoConvertido = quantidadeFinal > 0 ? valorTotalItem / quantidadeFinal : itemNota.precoUnitario;

        if (!ultimaCompraDoUsuario || new Date(itemNota.dataCompra) > new Date(ultimaCompraDoUsuario.data)) {
          ultimaCompraDoUsuario = { data: itemNota.dataCompra, preco: precoConvertido, quantidade: itemNota.quantidade };
        }
      }

      // Fallback: usar preço do próprio estoque se não encontrou nas notas
      if (!ultimaCompraDoUsuario && estoqueInfo) {
        const { data: estoqueCompleto } = await supabase
          .from('estoque_app')
          .select('preco_unitario_ultimo, preco_por_unidade_base, updated_at')
          .eq('id', produtoId)
          .maybeSingle();
        
        if (estoqueCompleto) {
          const precoBase = estoqueCompleto.preco_por_unidade_base || estoqueCompleto.preco_unitario_ultimo;
          if (precoBase && precoBase > 0) {
            ultimaCompraDoUsuario = { data: estoqueCompleto.updated_at, preco: precoBase, quantidade: 1 };
          }
        }
      }

      resultado.push({ id: produtoId, produto: produtoNome, ultimaCompraUsuario: ultimaCompraDoUsuario, menorPrecoArea: null });
    }

    console.log(`✅ Resultados: ${resultado.length} produtos processados`);

    return new Response(JSON.stringify({ success: true, resultados: resultado }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('Erro na função buscar-historico-precos-estoque:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
