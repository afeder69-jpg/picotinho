import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CacheEntry {
  id: string;
  chave_nfce: string;
  dados_completos: any;
  total_consultas: number;
}

/**
 * Verifica cache no Supabase antes de consultar API
 */
async function checkCache(supabase: any, chaveNFCe: string): Promise<CacheEntry | null> {
  console.log(`🔍 [CACHE] Verificando cache para chave: ${chaveNFCe.substring(0, 4)}...${chaveNFCe.substring(40)}`);
  
  const { data, error } = await supabase
    .from('nfce_cache_infosimples')
    .select('*')
    .eq('chave_nfce', chaveNFCe)
    .eq('tipo_consulta', 'completa')
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      console.log('❌ [CACHE] Miss - Chave não encontrada no cache');
      return null;
    }
    console.error('⚠️ [CACHE] Erro ao verificar cache:', error);
    return null;
  }

  if (data) {
    console.log(`✅ [CACHE] Hit! Encontrado no cache (${data.total_consultas} consultas anteriores)`);
    
    // Incrementar contador de consultas
    await supabase
      .from('nfce_cache_infosimples')
      .update({ 
        total_consultas: data.total_consultas + 1,
        ultima_consulta: new Date().toISOString()
      })
      .eq('id', data.id);

    return data;
  }

  return null;
}

/**
 * Salva resposta da API no cache
 */
async function saveToCache(supabase: any, chaveNFCe: string, dadosNFCe: any): Promise<void> {
  console.log(`💾 [CACHE] Salvando no cache: ${chaveNFCe.substring(0, 4)}...${chaveNFCe.substring(40)}`);
  
  try {
    const emitente = dadosNFCe.data?.[0]?.emitente;
    const info = dadosNFCe.data?.[0]?.informacoes_nota;
    
    const { error } = await supabase
      .from('nfce_cache_infosimples')
      .insert({
        chave_nfce: chaveNFCe,
        cnpj_emitente: emitente?.cnpj?.replace(/\D/g, ''),
        nome_emitente: emitente?.nome_razao_social,
        data_emissao: info?.data_emissao ? parseDataBrasileira(info.data_emissao) : null,
        valor_total: dadosNFCe.data?.[0]?.normalizado_valor_total || 0,
        tipo_consulta: 'completa',
        dados_completos: dadosNFCe
      });

    if (error) {
      console.error('❌ [CACHE] Erro ao salvar no cache:', error);
      throw error;
    }

    console.log('✅ [CACHE] Dados salvos com sucesso');
  } catch (error) {
    console.error('❌ [CACHE] Falha ao salvar cache:', error);
    throw error;
  }
}

/**
 * Converte data brasileira (DD/MM/YYYY) para ISO
 */
function parseDataBrasileira(data: string): string | null {
  try {
    const [dia, mes, ano] = data.split('/');
    return `${ano}-${mes}-${dia}T00:00:00.000Z`;
  } catch (error) {
    console.error('⚠️ Erro ao parsear data:', data, error);
    return null;
  }
}

/**
 * Consulta API InfoSimples
 */
async function consultarNFCeInfoSimples(chaveNFCe: string): Promise<any> {
  const token = Deno.env.get('INFOSIMPLES_TOKEN');

  if (!token) {
    throw new Error('Token InfoSimples não configurado');
  }

  const apiUrl = `https://api.infosimples.com/api/v2/consultas/sefaz/rj/nfce-completa?token=${token}&timeout=600&ignore_site_receipt=0&nfce=${chaveNFCe}`;
  
  console.log('🌐 [INFOSIMPLES] Consultando API...');
  console.log(`   URL: ${apiUrl.replace(token, 'TOKEN_HIDDEN')}`);
  
  const response = await fetch(apiUrl, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`❌ [INFOSIMPLES] Erro HTTP ${response.status}:`, errorText);
    throw new Error(`InfoSimples API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  
  if (data.code !== 200) {
    console.error('❌ [INFOSIMPLES] Resposta com erro:', data);
    throw new Error(`InfoSimples error: ${data.code_message}`);
  }

  console.log('✅ [INFOSIMPLES] Consulta realizada com sucesso');
  console.log(`   💰 Custo: R$ ${data.header?.price || '0.00'}`);
  console.log(`   ⏱️  Tempo: ${data.header?.elapsed_time_in_milliseconds || 0}ms`);

  return data;
}

/**
 * Processa os dados da NFC-e e salva na tabela notas_imagens
 */
async function processarNFCe(
  supabase: any,
  userId: string,
  notaImagemId: string,
  dadosNFCe: any,
  urlOriginal: string
): Promise<void> {
  console.log('📦 [PROCESSAR] Extraindo dados estruturados da NFC-e...');
  
  const nfceData = dadosNFCe.data?.[0];
  
  if (!nfceData) {
    throw new Error('Dados da NFC-e não encontrados na resposta');
  }

  // 🔍 DEBUG COMPLETO: Ver toda estrutura da resposta
  console.log('🔍 [DEBUG] Estrutura completa nfceData:', JSON.stringify({
    keys: Object.keys(nfceData),
    emitente_keys: nfceData.emitente ? Object.keys(nfceData.emitente) : 'null',
    info_nota_keys: nfceData.informacoes_nota ? Object.keys(nfceData.informacoes_nota) : 'null',
    primeiro_produto: nfceData.produtos?.[0] ? Object.keys(nfceData.produtos[0]) : 'null',
    campos_valor: {
      valor_total: nfceData.valor_total,
      normalizado_valor_total: nfceData.normalizado_valor_total,
      valor_a_pagar: nfceData.valor_a_pagar
    },
    campos_emitente: {
      nome_razao_social: nfceData.emitente?.nome_razao_social,
      nome_fantasia: nfceData.emitente?.nome_fantasia,
      cnpj: nfceData.emitente?.cnpj
    }
  }, null, 2));

  // Processar produtos
  let produtosComDesconto = 0;
  let economiaTotal = 0;
  
  const produtos = nfceData.produtos?.map((p: any) => {
    // ✅ Extrair valores dos campos corretos da API InfoSimples
    const valorDesconto = parseFloat(p.valor_desconto || p.normalizado_valor_desconto || '0');
    
    // ✅ Valor unitário comercial é o campo correto
    const valorOriginal = parseFloat(
      p.valor_unitario_comercial || 
      p.normalizado_valor || 
      p.valor || 
      '0'
    );
    
    // ✅ Quantidade do produto
    const quantidade = parseFloat(
      p.qtd || 
      p.quantidade_comercial || 
      p.quantidade || 
      '1'
    );
    
    // Preço FINAL = preço unitário - desconto
    const valorUnitarioFinal = valorOriginal - valorDesconto;
    
    // ✅ Calcular valor total (valor unitário × quantidade)
    const valorTotalFinal = valorUnitarioFinal * quantidade;
    
    const temDesconto = valorDesconto > 0;
    
    if (temDesconto) {
      produtosComDesconto++;
      economiaTotal += valorDesconto * quantidade;
    }
    
    return {
      codigo: p.codigo,
      nome: p.nome || p.descricao,
      quantidade: quantidade,
      unidade: p.unidade || 'UN',
      valor_unitario: valorUnitarioFinal,
      valor_total: valorTotalFinal,
      tem_desconto: temDesconto,
      _valor_desconto_aplicado: temDesconto ? valorDesconto : undefined,
      _valor_original: temDesconto ? valorOriginal : undefined
    };
  }) || [];

  // Extrair emitente
  const emitente = {
    cnpj: nfceData.emitente?.cnpj?.replace(/\D/g, ''),
    nome: nfceData.emitente?.nome_razao_social || nfceData.emitente?.nome_fantasia,
    endereco: nfceData.emitente?.endereco
  };

  // ✅ Criar estabelecimento no formato esperado pelo frontend
  const estabelecimento = {
    cnpj: nfceData.emitente?.cnpj?.replace(/\D/g, ''),
    nome: nfceData.emitente?.nome_fantasia || nfceData.emitente?.nome_razao_social,
    endereco: nfceData.emitente?.endereco
  };

  // Extrair informações da nota
  const infoNota = nfceData.informacoes_nota || nfceData;
  
  // ✅ Converter data brasileira para ISO - buscar no objeto nfe primeiro
  const dataEmissaoRaw = nfceData.nfe?.data_emissao || infoNota?.data_emissao || nfceData.data_emissao;
  const dataEmissaoISO = dataEmissaoRaw ? parseDataBrasileira(dataEmissaoRaw) : null;
  
  const dadosExtraidos = {
    chave_acesso: (infoNota?.chave_acesso || nfceData.chave)?.replace(/\s/g, ''),
    numero_nota: infoNota?.numero || nfceData.numero,
    serie: infoNota?.serie || nfceData.serie,
    
    // ✅ Data em formato ISO para o frontend
    data_emissao: dataEmissaoISO,
    hora_emissao: infoNota?.hora_emissao || nfceData.hora_emissao,
    
    // ✅ CRÍTICO: Salvar HTML da nota para fallback
    html_capturado: nfceData.site_receipt || null,
    
    // ✅ Valores numéricos (não strings) - buscar em totais primeiro
    valor_total: parseFloat(
      nfceData.totais?.normalizado_valor_nfe || 
      nfceData.nfe?.normalizado_valor_total ||
      nfceData.valor_total || 
      '0'
    ),
    valor_desconto_total: parseFloat(
      nfceData.normalizado_valor_desconto || 
      nfceData.valor_desconto || 
      '0'
    ),
    valor_a_pagar: parseFloat(
      nfceData.normalizado_valor_a_pagar || 
      nfceData.valor_a_pagar || 
      '0'
    ),
    quantidade_itens: parseInt(
      nfceData.normalizado_quantidade_total_items || 
      nfceData.quantidade_itens || 
      produtos.length.toString()
    ),
    produtos,
    
    // ✅ Formato esperado pelo SimplifiedInAppBrowser
    estabelecimento,
    
    // Manter compatibilidade com formato antigo
    emitente,
    
    formas_pagamento: nfceData.formas_pagamento || nfceData.pagamento,
    origem_api: 'infosimples_completa',
    url_html_nota: nfceData.site_receipt,
    timestamp_processamento: new Date().toISOString()
  };

  console.log(`   ✅ ${produtos.length} produtos extraídos`);
  console.log(`   💵 Valor total: R$ ${dadosExtraidos.valor_total}`);
  
  // Logs de desconto para tracking
  if (produtosComDesconto > 0) {
    console.log(`   🏷️  ${produtosComDesconto} produtos com desconto`);
    console.log(`   💰 Economia total: R$ ${economiaTotal.toFixed(2)}`);
  }
  
  console.log(`   🏪 Emitente: ${emitente.nome}`);

  // Atualizar nota_imagens com os dados processados
  const { error: updateError } = await supabase
    .from('notas_imagens')
    .update({
      processada: true,
      dados_extraidos: dadosExtraidos,
      imagem_url: nfceData.site_receipt, // HTML da nota fiscal
      updated_at: new Date().toISOString()
    })
    .eq('id', notaImagemId);

  if (updateError) {
    console.error('❌ [PROCESSAR] Erro ao atualizar notas_imagens:', updateError);
    throw updateError;
  }

  console.log('✅ [PROCESSAR] Nota atualizada com sucesso');
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { chaveAcesso, userId, notaImagemId } = await req.json();

    if (!chaveAcesso || !userId) {
      throw new Error('chaveAcesso e userId são obrigatórios');
    }

    console.log('🎫 [NFCE-INFOSIMPLES] Iniciando processamento...');
    console.log(`   Chave: ${chaveAcesso.substring(0, 4)}...${chaveAcesso.substring(40)}`);
    console.log(`   User: ${userId}`);
    console.log(`   Nota ID: ${notaImagemId || 'não fornecido'}`);

    // 1. Verificar cache
    const cached = await checkCache(supabase, chaveAcesso);
    
    let dadosNFCe;
    
    if (cached) {
      console.log('📋 [CACHE] Usando dados do cache (economia de R$ 0,24)');
      dadosNFCe = cached.dados_completos;
    } else {
      // 2. Consultar API InfoSimples
      dadosNFCe = await consultarNFCeInfoSimples(chaveAcesso);
      
      // 3. Salvar no cache
      await saveToCache(supabase, chaveAcesso, dadosNFCe);
    }

    // 4. Processar e salvar dados
    if (notaImagemId) {
      await processarNFCe(supabase, userId, notaImagemId, dadosNFCe, '');
      
      // 5. Invocar process-structured-receipt para processar estoque direto (sem OpenAI)
      console.log('🔄 [ESTOQUE] Invocando processamento de estoque estruturado...');
      const { error: extractError } = await supabase.functions.invoke('process-structured-receipt', {
        body: { 
          notaImagemId,
          userId 
        }
      });

      if (extractError) {
        console.error('⚠️ [ESTOQUE] Erro ao processar estoque:', extractError);
        // Não falhar a requisição por causa disso
      } else {
        console.log('✅ [ESTOQUE] Estoque atualizado com sucesso');
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        cached: !!cached,
        notaId: notaImagemId,
        produtos: dadosNFCe.data?.[0]?.produtos?.length || 0,
        valor_total: dadosNFCe.data?.[0]?.normalizado_valor_total,
        message: cached 
          ? 'NFC-e processada com sucesso (cache)'
          : 'NFC-e processada com sucesso (API InfoSimples - R$ 0,24)'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('❌ [NFCE-INFOSIMPLES] Erro:', error);
    
    return new Response(
      JSON.stringify({ 
        error: error.message,
        details: 'Erro ao processar NFC-e via InfoSimples'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400 
      }
    );
  }
});
