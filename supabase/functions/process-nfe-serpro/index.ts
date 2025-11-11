// Edge Function: Processa NFe via API Serpro com OAuth + Cache Persistente
// ============================================================================
// Este edge function integra com a API oficial da Serpro para buscar dados de NFe.
// Implementa OAuth 2.0 automático e cache persistente para economia de créditos.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================================================
// GERENCIAMENTO DE TOKEN OAUTH
// ============================================================================

interface TokenCache {
  access_token: string;
  expires_at: number; // timestamp em ms
}

let tokenCache: TokenCache | null = null;

/**
 * Obtém token OAuth da API Serpro (ou reutiliza se ainda válido)
 */
async function getAccessToken(): Promise<string> {
  const now = Date.now();
  
  // Reutilizar token se ainda válido (com margem de 5 min)
  if (tokenCache && tokenCache.expires_at > now + 300000) {
    console.log('🔑 [OAUTH] Reutilizando token em cache (válido por mais', 
      Math.floor((tokenCache.expires_at - now) / 60000), 'minutos)');
    return tokenCache.access_token;
  }
  
  console.log('🔑 [OAUTH] Gerando novo token...');
  
  const consumerKey = Deno.env.get('SERPRO_CONSUMER_KEY');
  const consumerSecret = Deno.env.get('SERPRO_CONSUMER_SECRET');
  const tokenUrl = Deno.env.get('SERPRO_TOKEN_URL');
  
  if (!consumerKey || !consumerSecret || !tokenUrl) {
    throw new Error('❌ Credenciais Serpro não configuradas nos secrets');
  }
  
  const credentials = btoa(`${consumerKey}:${consumerSecret}`);
  
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  
  if (!response.ok) {
    const error = await response.text();
    console.error('❌ [OAUTH] Erro ao obter token:', error);
    throw new Error(`Falha na autenticação OAuth: ${response.status}`);
  }
  
  const data = await response.json();
  
  // Cachear token (expira em `expires_in` segundos)
  const expiresIn = data.expires_in || 3600; // padrão 1h
  tokenCache = {
    access_token: data.access_token,
    expires_at: now + (expiresIn * 1000),
  };
  
  console.log('✅ [OAUTH] Novo token gerado (válido por', expiresIn, 'segundos)');
  return data.access_token;
}

// ============================================================================
// MAPEAMENTO DE UF E EXTRAÇÃO DE CHAVE NFE
// ============================================================================

/**
 * Mapeamento de códigos IBGE → sigla UF
 * Os 2 primeiros dígitos da chave NFe indicam o código IBGE da UF
 */
const UF_MAP: Record<string, string> = {
  '11': 'ro', '12': 'ac', '13': 'am', '14': 'rr', '15': 'pa',
  '16': 'ap', '17': 'to', '21': 'ma', '22': 'pi', '23': 'ce',
  '24': 'rn', '25': 'pb', '26': 'pe', '27': 'al', '28': 'se',
  '29': 'ba', '31': 'mg', '32': 'es', '33': 'rj', // ← RIO DE JANEIRO
  '35': 'sp', // ← SÃO PAULO
  '41': 'pr', '42': 'sc', '43': 'rs', '50': 'ms', '51': 'mt',
  '52': 'go', '53': 'df'
};

/**
 * Detecta UF pela chave NFe (primeiros 2 dígitos = código IBGE)
 */
function detectarUF(chaveNFe: string): string {
  const codigoUF = chaveNFe.substring(0, 2);
  const uf = UF_MAP[codigoUF];
  
  if (!uf) {
    throw new Error(`❌ Código de UF não reconhecido: ${codigoUF} (chave: ${chaveNFe})`);
  }
  
  console.log(`📍 [UF] Detectada: ${uf.toUpperCase()} (código ${codigoUF})`);
  return uf;
}

/**
 * Extrai chave de 44 dígitos da URL da NFe
 */
function extractNFeKey(url: string): string | null {
  // Padrões comuns de URL de NFe:
  // http://www.nfe.fazenda.gov.br/portal/consultaRecaptcha.aspx?chNFe=CHAVE_44_DIGITOS
  // http://nfe.sefaz.pe.gov.br/nfe-service/consulta/chave/CHAVE_44_DIGITOS
  
  const patterns = [
    /chNFe=(\d{44})/i,
    /chave[=/](\d{44})/i,
    /\/(\d{44})/,
    /\?(\d{44})/,
    /\b(\d{44})\b/,
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      const key = match[1];
      if (/^\d{44}$/.test(key)) {
        console.log('🔍 [CHAVE] Extraída:', key);
        return key;
      }
    }
  }
  
  console.error('❌ [CHAVE] Não encontrada chave de 44 dígitos na URL:', url);
  return null;
}

// ============================================================================
// CACHE SERPRO
// ============================================================================

interface CacheEntry {
  id: string;
  chave_nfe: string;
  dados_completos: any;
  total_consultas: number;
}

/**
 * Verifica se a NFe já está em cache
 */
async function checkCache(supabase: any, chaveNFe: string): Promise<CacheEntry | null> {
  console.log('💾 [CACHE] Verificando cache para chave:', chaveNFe);
  
  const { data, error } = await supabase
    .from('nfe_cache_serpro')
    .select('*')
    .eq('chave_nfe', chaveNFe)
    .single();
  
  if (error) {
    if (error.code !== 'PGRST116') { // Not found é esperado
      console.error('⚠️ [CACHE] Erro ao consultar:', error);
    } else {
      console.log('📭 [CACHE] Miss - nota não está em cache');
    }
    return null;
  }
  
  console.log('✅ [CACHE] Hit! Nota já consultada', data.total_consultas, 'vez(es)');
  
  // Atualizar contadores
  await supabase
    .from('nfe_cache_serpro')
    .update({
      total_consultas: data.total_consultas + 1,
      ultima_consulta: new Date().toISOString(),
    })
    .eq('id', data.id);
  
  return data;
}

/**
 * Salva dados da NFe no cache
 */
async function saveToCache(supabase: any, chaveNFe: string, dadosNFe: any): Promise<void> {
  console.log('💾 [CACHE] Salvando no cache...');
  
  const cacheData = {
    chave_nfe: chaveNFe,
    cnpj_emitente: dadosNFe.emit?.CNPJ || null,
    nome_emitente: dadosNFe.emit?.xNome || null,
    data_emissao: dadosNFe.ide?.dhEmi || null,
    valor_total: dadosNFe.total?.ICMSTot?.vNF ? parseFloat(dadosNFe.total.ICMSTot.vNF) : null,
    dados_completos: dadosNFe,
  };
  
  const { error } = await supabase
    .from('nfe_cache_serpro')
    .insert(cacheData);
  
  if (error) {
    console.error('❌ [CACHE] Erro ao salvar:', error);
  } else {
    console.log('✅ [CACHE] Salvo com sucesso');
  }
}

// ============================================================================
// CONSULTA API SERPRO
// ============================================================================

/**
 * Consulta NFe na API Serpro (endpoint dinâmico baseado na UF)
 */
async function consultarNFeSerpro(chaveNFe: string, accessToken: string): Promise<any> {
  const apiBase = Deno.env.get('SERPRO_API_BASE');
  
  if (!apiBase) {
    throw new Error('❌ SERPRO_API_BASE não configurada nos secrets');
  }
  
  // Detectar UF pela chave NFe
  const uf = detectarUF(chaveNFe);
  
  // Construir URL do endpoint oficial da Serpro
  // Formato: https://gateway.apiserpro.serpro.gov.br/consulta-nfe-[uf]/api/v1/nfe/[chave]
  const url = `${apiBase}/consulta-nfe-${uf}/api/v1/nfe/${chaveNFe}`;
  
  console.log('📡 [SERPRO] Consultando API:', url);
  console.log('📍 [SERPRO] UF detectada:', uf.toUpperCase());
  console.log('🔑 [SERPRO] Chave NFe:', chaveNFe);
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
    },
  });
  
  if (!response.ok) {
    const error = await response.text();
    console.error('❌ [SERPRO] Erro na API:', response.status, error);
    throw new Error(`Erro na API Serpro: ${response.status} - ${error}`);
  }
  
  const data = await response.json();
  console.log('✅ [SERPRO] Dados recebidos com sucesso');
  
  return data;
}

// ============================================================================
// PROCESSAMENTO DE NFE
// ============================================================================

/**
 * Processa dados da NFe e salva em notas_imagens
 */
async function processarNFe(
  supabase: any,
  userId: string,
  chaveNFe: string,
  dadosNFe: any,
  urlOriginal: string
): Promise<string> {
  console.log('🔄 [PROCESSAMENTO] Preparando dados para salvar...');
  
  // Extrair produtos da NFe
  const produtos = dadosNFe.det || [];
  const produtosExtraidos = produtos.map((item: any) => ({
    nome: item.prod?.xProd || 'Produto sem nome',
    quantidade: parseFloat(item.prod?.qCom || 1),
    valor_unitario: parseFloat(item.prod?.vUnCom || 0),
    valor_total: parseFloat(item.prod?.vProd || 0),
    unidade: item.prod?.uCom || 'UN',
    codigo: item.prod?.cProd || null,
    codigo_barras: item.prod?.cEAN || null,
  }));
  
  // Dados do estabelecimento
  const nomeOriginalEstabelecimento = dadosNFe.emit?.xNome || 'Estabelecimento desconhecido';
  const cnpjEstabelecimento = dadosNFe.emit?.CNPJ || null;

  // ✅ Aplicar normalização usando a função do banco (COM CNPJ!)
  let nomeNormalizadoEstabelecimento = nomeOriginalEstabelecimento;
  try {
    const { data: nomeNorm, error: normError } = await supabase.rpc('normalizar_nome_estabelecimento', {
      nome_input: nomeOriginalEstabelecimento,
      cnpj_input: cnpjEstabelecimento
    });
    
    if (normError) {
      console.error('⚠️ Erro ao normalizar estabelecimento:', normError);
    } else if (nomeNorm) {
      nomeNormalizadoEstabelecimento = nomeNorm;
      console.log(`   ✅ Estabelecimento normalizado: "${nomeOriginalEstabelecimento}" → "${nomeNormalizadoEstabelecimento}"`);
    }
  } catch (error) {
    console.error('⚠️ Exceção ao normalizar:', error);
  }

  const estabelecimento = {
    nome: nomeNormalizadoEstabelecimento,
    nome_original: nomeOriginalEstabelecimento,
    cnpj: cnpjEstabelecimento,
    endereco: dadosNFe.emit?.enderEmit ? 
      `${dadosNFe.emit.enderEmit.xLgr || ''}, ${dadosNFe.emit.enderEmit.nro || ''} - ${dadosNFe.emit.enderEmit.xBairro || ''}, ${dadosNFe.emit.enderEmit.xMun || ''} - ${dadosNFe.emit.enderEmit.UF || ''}`.trim() 
      : null,
  };
  
  // Criar entrada em notas_imagens
  const notaData = {
    usuario_id: userId,
    origem: 'serpro_api',
    imagem_url: urlOriginal,
    imagem_path: `nfe/${chaveNFe}`,
    nome_original: `NFe-${chaveNFe}.json`,
    processada: true,
    dados_extraidos: {
      produtos: produtosExtraidos,
      estabelecimento,
      data_emissao: dadosNFe.ide?.dhEmi || null,
      valor_total: dadosNFe.total?.ICMSTot?.vNF || null,
      chave_nfe: chaveNFe,
      numero_nfe: dadosNFe.ide?.nNF || null,
    },
  };
  
  const { data: notaInserida, error } = await supabase
    .from('notas_imagens')
    .insert(notaData)
    .select()
    .single();
  
  if (error) {
    console.error('❌ [DB] Erro ao salvar nota_imagem:', error);
    throw new Error('Falha ao salvar nota no banco');
  }
  
  console.log('✅ [DB] Nota salva em notas_imagens:', notaInserida.id);
  
  // Marcar como pendente de aprovação
  await supabase
    .from('notas_imagens')
    .update({ status_aprovacao: 'pendente_aprovacao' })
    .eq('id', notaInserida.id);
  
  console.log('✅ [DB] NFe pronta para aprovação do usuário');
  
  return notaInserida.id;
}

// ============================================================================
// HANDLER PRINCIPAL
// ============================================================================

serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    console.log('🚀 [SERPRO] Iniciando processamento de NFe...');
    
    const { url, userId } = await req.json();
    
    if (!url || !userId) {
      throw new Error('❌ Parâmetros obrigatórios: url, userId');
    }
    
    console.log('👤 [USER]', userId);
    console.log('🔗 [URL]', url);
    
    // Extrair chave da NFe
    const chaveNFe = extractNFeKey(url);
    if (!chaveNFe) {
      return new Response(
        JSON.stringify({ 
          error: 'Não foi possível extrair a chave da NFe da URL fornecida' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Inicializar Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Verificar cache
    const cached = await checkCache(supabase, chaveNFe);
    let dadosNFe: any;
    let fromCache = false;
    
    if (cached) {
      console.log('💾 [CACHE] Usando dados em cache');
      dadosNFe = cached.dados_completos;
      fromCache = true;
    } else {
      console.log('📡 [API] Consultando API Serpro...');
      
      // Obter token OAuth
      const accessToken = await getAccessToken();
      
      // Consultar API
      dadosNFe = await consultarNFeSerpro(chaveNFe, accessToken);
      
      // Salvar no cache
      await saveToCache(supabase, chaveNFe, dadosNFe);
    }
    
    // Processar e salvar nota
    const notaImagemId = await processarNFe(supabase, userId, chaveNFe, dadosNFe, url);
    
    // Invocar extract-receipt-image para processar estoque
    console.log('🔄 [ESTOQUE] Invocando extract-receipt-image...');
    const { data: extractResult, error: extractError } = await supabase.functions.invoke(
      'extract-receipt-image',
      {
        body: { notaImagemId },
      }
    );
    
    if (extractError) {
      console.error('⚠️ [ESTOQUE] Erro ao processar estoque:', extractError);
    } else {
      console.log('✅ [ESTOQUE] Processado com sucesso');
    }
    
    console.log('🎉 [SUCCESS] Processamento concluído!');
    
    return new Response(
      JSON.stringify({
        success: true,
        notaImagemId,
        chaveNFe,
        fromCache,
        message: fromCache 
          ? 'Nota processada com sucesso (dados em cache - sem custo)' 
          : 'Nota processada com sucesso (consultado API Serpro)',
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
    
  } catch (error) {
    console.error('❌ [ERROR]', error);
    
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Erro ao processar NFe',
        details: error.toString(),
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
