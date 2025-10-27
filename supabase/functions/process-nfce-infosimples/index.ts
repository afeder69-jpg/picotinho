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
  const tokenName = Deno.env.get('INFOSIMPLES_TOKEN_NAME');
  const tokenSecret = Deno.env.get('INFOSIMPLES_TOKEN_SECRET');

  if (!tokenName || !tokenSecret) {
    throw new Error('Credenciais InfoSimples não configuradas');
  }

  const apiUrl = `https://api.infosimples.com/api/v2/consultas/sefaz/rj/nfce-resumida?nfce=${chaveNFCe}`;
  
  console.log('🌐 [INFOSIMPLES] Consultando API...');
  console.log(`   URL: ${apiUrl}`);
  console.log(`   Token Name: ${tokenName}`);
  
  const auth = btoa(`${tokenName}:${tokenSecret}`);
  
  const response = await fetch(apiUrl, {
    method: 'GET',
    headers: {
      'Authorization': `Basic ${auth}`,
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

  // Extrair produtos
  const produtos = nfceData.produtos?.map((p: any) => ({
    codigo: p.codigo,
    nome: p.nome,
    quantidade: p.normalizado_quantidade,
    valor_unitario: p.normalizado_valor_unitario,
    valor_total: p.normalizado_valor_total_produto,
    unidade: p.unidade
  })) || [];

  // Extrair emitente
  const emitente = {
    cnpj: nfceData.emitente?.cnpj?.replace(/\D/g, ''),
    nome: nfceData.emitente?.nome_razao_social,
    endereco: nfceData.emitente?.endereco
  };

  // Extrair informações da nota
  const infoNota = nfceData.informacoes_nota;
  
  const dadosExtraidos = {
    chave_acesso: infoNota?.chave_acesso?.replace(/\s/g, ''),
    numero_nota: infoNota?.numero,
    serie: infoNota?.serie,
    data_emissao: infoNota?.data_emissao,
    hora_emissao: infoNota?.hora_emissao,
    valor_total: nfceData.normalizado_valor_total,
    valor_desconto: nfceData.normalizado_valor_desconto,
    valor_a_pagar: nfceData.normalizado_valor_a_pagar,
    quantidade_itens: nfceData.normalizado_quantidade_total_items,
    produtos,
    emitente,
    formas_pagamento: nfceData.formas_pagamento,
    origem_api: 'infosimples',
    url_html_nota: nfceData.site_receipt,
    timestamp_processamento: new Date().toISOString()
  };

  console.log(`   ✅ ${produtos.length} produtos extraídos`);
  console.log(`   💵 Valor total: R$ ${dadosExtraidos.valor_total}`);
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
      
      // 5. Invocar extract-receipt-image para processar estoque
      console.log('🔄 [ESTOQUE] Invocando processamento de estoque...');
      const { error: extractError } = await supabase.functions.invoke('extract-receipt-image', {
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
