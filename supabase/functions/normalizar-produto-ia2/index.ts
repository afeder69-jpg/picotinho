import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Dicionário de abreviações e sinônimos
const DICIONARIO = {
  "embalagem_sinonimos": {
    "BDJ": "BANDEJA",
    "BANDEJ": "BANDEJA",
    "PCT": "PACOTE",
    "PC": "PACOTE",
    "PAC": "PACOTE",
    "PACK": "PACOTE",
    "CX": "CAIXA",
    "CAIX": "CAIXA",
    "FAR": "FARDO",
    "FD": "FARDO",
    "PT": "POTE",
    "LT": "LITRO",
    "LTS": "LITRO",
    "LATA": "LATA",
    "SACH": "SACHÊ",
    "SACHE": "SACHÊ",
    "TP": "TETRAPAK",
    "TPK": "TETRAPAK",
    "GARRAFA": "GARRAFA",
    "PET": "PET"
  },
  "unidades_sinonimos": {
    "K": "KG",
    "KG": "KG",
    "KILO": "KG",
    "QUILO": "KG",
    "G": "G",
    "GR": "G",
    "GRAMAS": "G",
    "L": "L",
    "LT": "L",
    "LTS": "L",
    "LITRO": "L",
    "LITROS": "L",
    "ML": "ML",
    "MILILITRO": "ML",
    "MILILITROS": "ML",
    "UN": "UN",
    "UND": "UN",
    "UNID": "UN",
    "UNIDADE": "UN",
    "UNIDADES": "UN"
  },
  "granel_tokens": ["GRANEL", "A GRANEL"],
  "pontuacao_ruido": ["-", "_", ".", ","]
};

// Feature flag para normalização - HABILITADA POR PADRÃO
const NORMALIZACAO_PRODUTOS_V1 = Deno.env.get('NORMALIZACAO_PRODUTOS_V1') !== 'false';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { nomeOriginal } = await req.json();

    if (!nomeOriginal) {
      throw new Error('nomeOriginal é obrigatório');
    }

    console.log(`[NORMALIZAR-IA2] Processando: ${nomeOriginal}`);

    // Se feature flag desabilitada, retornar estrutura básica
    if (!NORMALIZACAO_PRODUTOS_V1) {
      console.log('[NORMALIZAR-IA2] Feature flag desabilitada, usando estrutura básica');
      return new Response(JSON.stringify({
        produto_nome_normalizado: nomeOriginal.toUpperCase().trim(),
        nome_base: nomeOriginal.toUpperCase().trim(),
        marca: null,
        tipo_embalagem: null,
        qtd_valor: null,
        qtd_unidade: null,
        qtd_base: null,
        granel: false,
        produto_hash_normalizado: await gerarHash(nomeOriginal.toUpperCase().trim())
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Normalizar produto usando IA-2
    const resultadoNormalizacao = await normalizarProdutoCompleto(supabase, nomeOriginal);

    console.log(`[NORMALIZAR-IA2] Resultado: ${JSON.stringify(resultadoNormalizacao)}`);

    return new Response(JSON.stringify(resultadoNormalizacao), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[NORMALIZAR-IA2] Erro:', error);
    
    // Fallback em caso de erro - não deve travar nada
    return new Response(JSON.stringify({
      produto_nome_normalizado: req.body?.nomeOriginal?.toUpperCase()?.trim() || 'PRODUTO ERRO',
      nome_base: req.body?.nomeOriginal?.toUpperCase()?.trim() || 'PRODUTO ERRO',
      marca: null,
      tipo_embalagem: null,
      qtd_valor: null,
      qtd_unidade: null,
      qtd_base: null,
      granel: false,
      produto_hash_normalizado: 'erro',
      erro: error.message
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

async function normalizarProdutoCompleto(supabase: any, nomeOriginal: string) {
  // 🚨 CORREÇÃO CRÍTICA: Preservar TODAS as informações do produto original
  // NÃO remover informações como "1 UNIDADE", "170G", etc. que fazem parte da descrição
  
  // 1. Apenas normalizar caixa/acentos SEM remover informações
  let nomeProcessado = normalizarTexto(nomeOriginal);
  
  // 2. Buscar normalizações manuais no banco (precedem sobre IA)
  const normalizacaoManual = await buscarNormalizacaoManual(supabase, nomeProcessado);
  if (normalizacaoManual) {
    console.log(`[NORMALIZAR-IA2] Aplicada normalização manual: ${normalizacaoManual}`);
    return normalizacaoManual;
  }

  // 3. Expandir APENAS abreviações óbvias, preservando informações de peso/tamanho
  nomeProcessado = expandirAbreviacoes(nomeProcessado);

  // 4. Detectar granel
  const granel = detectarGranel(nomeProcessado);
  if (granel) {
    nomeProcessado = nomeProcessado.replace(/\b(A\s+)?GRANEL\b/gi, '').trim();
  }

  // 5. Detectar quantidade APENAS para peso/volume específico (170G, 1KG), NÃO para "1 UNIDADE"
  const quantidadeDetectada = detectarQuantidadeUnidade(nomeProcessado);
  
  // 🚨 CORREÇÃO: NÃO remover a quantidade do nome - ela faz parte da descrição do produto
  // Exemplo: "Milho Verde 170G" != "Milho Verde 300G" - são produtos diferentes!
  
  // 6. Detectar marca (mas NÃO remover do nome)
  const marcaDetectada = await detectarMarca(supabase, nomeProcessado);

  // 7. Detectar tipo de embalagem (mas NÃO remover do nome)
  const embalagemDetectada = detectarEmbalagem(nomeProcessado);

  // 8. ✅ PRESERVAR O NOME COMPLETO - apenas limpar espaços extras
  let nomeNormalizado = nomeProcessado.replace(/\s+/g, ' ').trim();
  
  // 8.1. Aplicar apenas correções ortográficas menores
  nomeNormalizado = nomeNormalizado.replace(/\bABACTE\b/gi, 'ABACATE');
  nomeNormalizado = nomeNormalizado.replace(/\bBANAN\b/gi, 'BANANA');
  nomeNormalizado = nomeNormalizado.replace(/\bCEBOL\b/gi, 'CEBOLA');
  nomeNormalizado = nomeNormalizado.replace(/\bTOMAT\b/gi, 'TOMATE');
  nomeNormalizado = nomeNormalizado.replace(/\bBATA[T]?\b/gi, 'BATATA');
  nomeNormalizado = nomeNormalizado.replace(/\bLARANJ\b/gi, 'LARANJA');
  nomeNormalizado = nomeNormalizado.replace(/\bLIMA[O]?\b/gi, 'LIMAO');

  // 9. Gerar hash baseado no nome completo (preservando todas as características)
  const produtoHash = await gerarHash(nomeNormalizado);

  // 10. Identificar nome base (sem marca/embalagem/peso para agrupamento)
  let nomeBase = nomeNormalizado;
  if (marcaDetectada) {
    nomeBase = nomeBase.replace(new RegExp(`\\b${marcaDetectada}\\b`, 'gi'), '').trim();
  }
  if (embalagemDetectada) {
    nomeBase = nomeBase.replace(new RegExp(`\\b${embalagemDetectada}\\b`, 'gi'), '').trim();
  }
  if (quantidadeDetectada.encontrada && quantidadeDetectada.regex) {
    nomeBase = nomeBase.replace(quantidadeDetectada.regex, '').trim();
  }
  nomeBase = nomeBase.replace(/\s+/g, ' ').trim();

  return {
    produto_nome_normalizado: nomeNormalizado, // ✅ NOME COMPLETO PRESERVADO
    nome_base: nomeBase,
    marca: marcaDetectada,
    tipo_embalagem: embalagemDetectada,
    qtd_valor: quantidadeDetectada.qtd_valor,
    qtd_unidade: quantidadeDetectada.qtd_unidade,
    qtd_base: quantidadeDetectada.qtd_base,
    granel: granel,
    produto_hash_normalizado: produtoHash
  };
}

function normalizarTexto(texto: string): string {
  return texto
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove acentos
    .replace(/[^\w\s]/g, ' ') // Remove pontuação
    .replace(/\s+/g, ' ')
    .trim();
}

async function buscarNormalizacaoManual(supabase: any, nomeProcessado: string) {
  // Buscar se existe normalização manual cadastrada
  const { data: normalizacao } = await supabase
    .from('normalizacoes_produtos')
    .select('nome_normalizado')
    .eq('nome_original', nomeProcessado)
    .eq('ativo', true)
    .single();

  return normalizacao?.nome_normalizado || null;
}

function expandirAbreviacoes(texto: string): string {
  let resultado = texto;

  // Expansões de produtos específicos primeiro
  resultado = resultado.replace(/\bFILE?\b/gi, 'FILÉ');
  resultado = resultado.replace(/\bPTO\b/gi, 'PEITO');
  resultado = resultado.replace(/\bFRGO?\b/gi, 'FRANGO');
  resultado = resultado.replace(/\bLIMPEZ\b/gi, 'LIMPEZA');
  resultado = resultado.replace(/\bCREMOS?\b/gi, 'CREMOSO');
  resultado = resultado.replace(/\bACHOCOL\b/gi, 'ACHOCOLATADO');
  resultado = resultado.replace(/\bBISC\b/gi, 'BISCOITO');
  resultado = resultado.replace(/\bMANT\b/gi, 'MANTEIGA');
  resultado = resultado.replace(/\bREQUEIJ\b/gi, 'REQUEIJÃO');
  resultado = resultado.replace(/\bDETERG\b/gi, 'DETERGENTE');
  resultado = resultado.replace(/\bSAB\b/gi, 'SABÃO');
  resultado = resultado.replace(/\bEXPLO?\b/gi, 'EXPLOSÃO');
  resultado = resultado.replace(/\bFLORES?\b/gi, 'FLORES');

  // Expandir abreviações de embalagem
  Object.entries(DICIONARIO.embalagem_sinonimos).forEach(([abrev, completo]) => {
    const regex = new RegExp(`\\b${abrev}\\b`, 'gi');
    resultado = resultado.replace(regex, completo);
  });

  // Expandir abreviações de unidade
  Object.entries(DICIONARIO.unidades_sinonimos).forEach(([abrev, completo]) => {
    const regex = new RegExp(`\\b${abrev}\\b`, 'gi');
    resultado = resultado.replace(regex, completo);
  });

  return resultado.replace(/\s+/g, ' ').trim();
}

function detectarGranel(texto: string): boolean {
  return DICIONARIO.granel_tokens.some(token => 
    texto.includes(token.toUpperCase())
  );
}

function detectarQuantidadeUnidade(texto: string) {
  // Regex mais restrita para não detectar erroneamente "1 UNIDADE" como quantidade
  const regexes = [
    // Padrões como "170G", "1KG", "1,5KG", "250ML" (SEM espaço antes da unidade)
    /(\d+(?:[.,]\d+)?)\s*(G|GR|GRAMAS|KG|K|QUILO|KILO|ML|MILILITROS?|L|LT|LTS|LITRO|LITROS)\b/gi,
    // Padrões isolados apenas para unidades de peso/volume, NÃO unidade
    /\b(\d+(?:[.,]\d+)?)\s*(G|GR|GRAMAS|KG|K|QUILO|KILO|ML|MILILITROS?|L|LT|LTS|LITRO|LITROS)\b/gi
  ];
  
  for (const regex of regexes) {
    const match = regex.exec(texto);
    if (match && match[1]) {
      // Tem quantidade e unidade de peso/volume
      const valor = parseFloat(match[1].replace(',', '.'));
      const unidade = DICIONARIO.unidades_sinonimos[match[2]?.toUpperCase()] || match[2]?.toUpperCase();
      
      let qtdBase = valor;
      if (unidade === 'KG') {
        qtdBase = valor * 1000;
      } else if (unidade === 'L') {
        qtdBase = valor * 1000;
      }

      return {
        encontrada: true,
        qtd_valor: valor,
        qtd_unidade: unidade,
        qtd_base: qtdBase,
        regex: new RegExp(match[0], 'gi')
      };
    }
  }

  return { encontrada: false, qtd_valor: null, qtd_unidade: null, qtd_base: null, regex: null };
}

async function detectarMarca(supabase: any, texto: string): Promise<string | null> {
  // Buscar marcas conhecidas no banco
  const { data: marcas } = await supabase
    .from('marcas_conhecidas')
    .select('nome')
    .eq('ativo', true);

  if (!marcas) return null;

  // Buscar se alguma marca aparece no texto
  for (const marca of marcas) {
    const regex = new RegExp(`\\b${marca.nome}\\b`, 'gi');
    if (regex.test(texto)) {
      return marca.nome;
    }
  }

  return null;
}

function detectarEmbalagem(texto: string): string | null {
  // Buscar tipos de embalagem conhecidos
  const embalagens = Object.values(DICIONARIO.embalagem_sinonimos);
  
  for (const embalagem of embalagens) {
    const regex = new RegExp(`\\b${embalagem}\\b`, 'gi');
    if (regex.test(texto)) {
      return embalagem;
    }
  }

  return null;
}

async function gerarHash(texto: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(texto);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}