/**
 * 📄 PROCESSAMENTO DE NFe (modelo 55 / DANFE) VIA INFOSIMPLES — CEARÁ (UF 23)
 *
 * Provider EXCLUSIVO do Ceará para NFe. Espelhado em process-nfe-infosimples (RJ),
 * adaptado ao endpoint /sefaz/ce/nfe e ao formato de resposta do CE.
 *
 * NÃO altera nenhum fluxo existente. Termina exatamente no mesmo estado
 * (status_processamento = 'aguardando_estoque') e dispara finalize-nota-estoque,
 * mantendo o ciclo: pendente_consulta → aguardando_estoque → processando → processada.
 *
 * Acionado por process-url-nota / retry-consulta-nfce-pendente quando modelo=55 e UF=23.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { classificarRespostaInfoSimples, NfcePendenteSefazError } from '../_shared/nfcePendente.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOG_PREFIX = '[NFE-CE]';

/** 🇧🇷 Converte valores brasileiros (vírgula) para JS (ponto). */
function parseBrazilianFloat(valor: string | number | undefined | null): number {
  if (valor === null || valor === undefined || valor === '') return 0;
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : 0;
  const valorLimpo = String(valor).trim().replace(/\./g, '').replace(',', '.');
  // Fallback: se não tem vírgula nem ponto BR, parsear direto
  const direct = parseFloat(String(valor).replace(',', '.'));
  const cleaned = parseFloat(valorLimpo);
  return Number.isFinite(cleaned) ? cleaned : (Number.isFinite(direct) ? direct : 0);
}

/**
 * Sanitiza EAN/código de barras. Retorna null para vazio, "SEM GTIN",
 * somente zeros, ou tamanhos diferentes de 8/12/13/14 dígitos.
 */
function limparEAN(valor: any): string | null {
  if (valor === null || valor === undefined) return null;
  const str = String(valor).trim();
  if (!str) return null;
  const upper = str.toUpperCase();
  if (upper === 'SEM GTIN' || upper.includes('SEM GTIN') || upper === 'NULL' || upper === 'N/A') return null;
  const digitos = str.replace(/\D/g, '');
  if (!digitos) return null;
  if (/^0+$/.test(digitos)) return null;
  if (![8, 12, 13, 14].includes(digitos.length)) return null;
  return digitos;
}

/** Categorização — mesmas regras dos demais providers. */
function categorizarProduto(descricao: string): string {
  const desc = (descricao || '').toLowerCase();

  if (desc.includes('leite') && !desc.includes('leite de coco')) return 'laticínios/frios';
  if (desc.includes('queijo')) return 'laticínios/frios';
  if (desc.includes('iogurte')) return 'laticínios/frios';
  if (desc.includes('manteiga') || desc.includes('margarina')) return 'laticínios/frios';
  if (desc.includes('creme de leite') || desc.includes('leite condensado')) return 'laticínios/frios';
  if (desc.includes('requeijão') || desc.includes('requeijao')) return 'laticínios/frios';
  if (desc.includes('embutido') || desc.includes('presunto') || desc.includes('mortadela')) return 'laticínios/frios';

  if (desc.includes('detergente') || desc.includes('sabao') || desc.includes('sabão')) return 'limpeza';
  if (desc.includes('desinfetante') || desc.includes('amaciante')) return 'limpeza';
  if (desc.includes('esponja') || desc.includes('bombril')) return 'limpeza';

  if (desc.includes('tempero verde') || desc.includes('ervas frescas')) return 'hortifruti';
  if (desc.includes('fruta') || desc.includes('verdura') || desc.includes('legume')) return 'hortifruti';
  if (desc.includes('banana') || desc.includes('maçã') || desc.includes('maca') || desc.includes('laranja')) return 'hortifruti';
  if (desc.includes('tomate') || desc.includes('alface') || desc.includes('cebola') || desc.includes('batata')) return 'hortifruti';
  if (desc.includes('cenoura') || desc.includes('beterraba') || desc.includes('pepino')) return 'hortifruti';

  if (desc.includes('arroz')) return 'mercearia';
  if (desc.includes('feijão') || desc.includes('feijao')) return 'mercearia';
  if (desc.includes('massa') || desc.includes('macarrão') || desc.includes('macarrao')) return 'mercearia';
  if (desc.includes('sal')) return 'mercearia';
  if (desc.includes('açúcar') || desc.includes('acucar')) return 'mercearia';
  if (desc.includes('óleo') || desc.includes('oleo') || desc.includes('azeite')) return 'mercearia';
  if (desc.includes('ovos')) return 'mercearia';
  if (desc.includes('milho') && (desc.includes('lata') || desc.includes('conserva') || desc.includes('verde'))) return 'mercearia';
  if (desc.includes('aveia')) return 'mercearia';
  if (desc.includes('conserva') || desc.includes('molho')) return 'mercearia';

  if (desc.includes('refrigerante') || desc.includes('suco')) return 'bebidas';
  if (desc.includes('água') || desc.includes('agua')) return 'bebidas';
  if (desc.includes('cerveja') || desc.includes('vinho')) return 'bebidas';
  if (desc.includes('energético') || desc.includes('energetico')) return 'bebidas';

  if (desc.includes('sabonete') || desc.includes('shampoo') || desc.includes('condicionador')) return 'higiene/farmácia';
  if (desc.includes('pasta de dente') || desc.includes('escova de dente')) return 'higiene/farmácia';
  if (desc.includes('papel higiênico') || desc.includes('papel higienico')) return 'higiene/farmácia';
  if (desc.includes('medicamento') || desc.includes('remédio') || desc.includes('remedio')) return 'higiene/farmácia';
  if (desc.includes('desodorante') || desc.includes('perfume')) return 'higiene/farmácia';

  if (desc.includes('carne') || desc.includes('bife') || desc.includes('picanha')) return 'açougue';
  if (desc.includes('frango') || desc.includes('peito') || desc.includes('coxa')) return 'açougue';
  if (desc.includes('peixe') || desc.includes('salmão') || desc.includes('salmao') || desc.includes('tilápia') || desc.includes('tilapia')) return 'açougue';
  if (desc.includes('linguiça') || desc.includes('linguica')) return 'açougue';

  if (desc.includes('pão') || desc.includes('pao')) return 'padaria';
  if (desc.includes('bolo') || desc.includes('biscoito') || desc.includes('torrada')) return 'padaria';

  if (desc.includes('sorvete') || desc.includes('congelado')) return 'congelados';
  if (desc.includes('pizza') && desc.includes('congelad')) return 'congelados';

  if (desc.includes('ração') || desc.includes('racao') || desc.includes('pet')) return 'pet';

  return 'outros';
}

/**
 * Parser seguro de data. Aceita ISO (com timezone) e formato BR
 * "DD/MM/YYYY HH:mm:ss". Trata "YYYY-MM-DD" como literal local
 * (NUNCA usa `new Date('YYYY-MM-DD')` direto, evitando bug de timezone).
 */
function parseDataEmissao(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const valor = String(raw).trim();
  if (!valor) return null;

  try {
    if (valor.includes('/')) {
      const partes = valor.split(' ');
      const dataParte = partes[0];
      const horaParte = (partes[1]?.split(/[+\-]\d{2}:?\d{2}$/)[0]) || '00:00:00';
      const [dia, mes, ano] = dataParte.split('/');
      if (dia && mes && ano && ano.length === 4) {
        return `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}T${horaParte}`;
      }
      return null;
    }

    if (valor.includes('T')) {
      const d = new Date(valor);
      if (isNaN(d.getTime())) return null;
      return d.toISOString();
    }

    const matchYmd = valor.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (matchYmd) {
      return `${matchYmd[1]}-${matchYmd[2]}-${matchYmd[3]}T00:00:00`;
    }

    return null;
  } catch (error) {
    console.error(`${LOG_PREFIX} ⚠️ Erro ao parsear data:`, valor, error);
    return null;
  }
}

interface CacheEntry {
  id: string;
  chave_nfe: string;
  dados_completos: any;
  total_consultas: number;
}

async function checkCache(supabase: any, chaveNFe: string): Promise<CacheEntry | null> {
  console.log(`${LOG_PREFIX} 🔍 [CACHE] Verificando cache: ${chaveNFe.substring(0, 4)}...${chaveNFe.substring(40)}`);
  const { data, error } = await supabase
    .from('nfe_cache_serpro')
    .select('*')
    .eq('chave_nfe', chaveNFe)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      console.log(`${LOG_PREFIX} ❌ [CACHE] Miss`);
      return null;
    }
    console.error(`${LOG_PREFIX} ⚠️ [CACHE] Erro:`, error);
    return null;
  }

  if (data) {
    console.log(`${LOG_PREFIX} ✅ [CACHE] Hit (${data.total_consultas || 0} consultas anteriores)`);
    await supabase
      .from('nfe_cache_serpro')
      .update({
        total_consultas: (data.total_consultas || 0) + 1,
        ultima_consulta: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', data.id);
    return data;
  }
  return null;
}

async function saveToCache(supabase: any, chaveNFe: string, dadosNFe: any): Promise<void> {
  console.log(`${LOG_PREFIX} 💾 [CACHE] Salvando: ${chaveNFe.substring(0, 4)}...${chaveNFe.substring(40)}`);
  try {
    const nota = dadosNFe.data?.[0] ?? {};
    const emitente = nota.emitente ?? {};
    const nfe = nota.nfe ?? nota.informacoes_nota ?? {};
    const dataEmissaoCacheRaw = nfe?.data_emissao || nota.data_emissao || null;
    const dataEmissaoCacheISO = parseDataEmissao(dataEmissaoCacheRaw);

    const { error } = await supabase
      .from('nfe_cache_serpro')
      .insert({
        chave_nfe: chaveNFe,
        cnpj_emitente: (emitente?.cnpj || '').replace(/\D/g, '') || null,
        nome_emitente: emitente?.nome || emitente?.nome_razao_social || null,
        data_emissao: dataEmissaoCacheISO,
        valor_total: parseBrazilianFloat(nfe?.normalizado_valor_total || nota.valor_total) || 0,
        dados_completos: dadosNFe,
        consultado_em: new Date().toISOString(),
        ultima_consulta: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    if (error) {
      console.error(`${LOG_PREFIX} ❌ [CACHE] Erro ao salvar:`, error);
      throw error;
    }
    console.log(`${LOG_PREFIX} ✅ [CACHE] Salvo`);
  } catch (error) {
    console.error(`${LOG_PREFIX} ❌ [CACHE] Falha:`, error);
    throw error;
  }
}

/** Consulta endpoint específico do Ceará (POST application/x-www-form-urlencoded). */
async function consultarNFeCEInfoSimples(chaveNFe: string): Promise<any> {
  const token = Deno.env.get('INFOSIMPLES_TOKEN');
  if (!token) throw new Error('Token InfoSimples não configurado');

  const apiUrl = 'https://api.infosimples.com/api/v2/consultas/sefaz/ce/nfe';
  console.log(`${LOG_PREFIX} 🌐 [INFOSIMPLES] Consultando endpoint NFe do Ceará...`);

  const body = new URLSearchParams();
  body.set('token', token);
  body.set('nfe', chaveNFe);
  body.set('timeout', '600');

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`${LOG_PREFIX} ❌ HTTP ${response.status}:`, errorText);
    throw new Error(`InfoSimples API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();

  if (data.code !== 200) {
    console.error(`${LOG_PREFIX} ❌ Resposta com erro:`, data);
    const classif = classificarRespostaInfoSimples(data);
    if (classif.pendente) {
      console.warn(`${LOG_PREFIX} ⏳ NFe pendente na SEFAZ (${classif.motivo}): ${classif.detalhe}`);
      throw new NfcePendenteSefazError(classif.motivo, classif.detalhe);
    }
    throw new Error(`InfoSimples error: ${data.code_message}`);
  }

  console.log(`${LOG_PREFIX} ✅ Consulta OK | 💰 R$ ${data.header?.price || '0.00'} | ⏱️ ${data.header?.elapsed_time_in_milliseconds || 0}ms`);
  return data;
}

/** Mapeia resposta CE → formato consumido pelo restante do pipeline. */
async function processarNFeCE(
  supabase: any,
  userId: string,
  notaImagemId: string,
  chaveAcesso: string,
  dadosNFe: any,
): Promise<void> {
  console.log(`${LOG_PREFIX} 📦 [PROCESSAR] Extraindo dados...`);

  const nfeData = dadosNFe.data?.[0];
  if (!nfeData) throw new Error('Dados da NFe CE não encontrados na resposta');

  const produtosRaw: any[] = Array.isArray(nfeData.produtos) ? nfeData.produtos : [];

  const produtos = produtosRaw.map((p: any) => {
    const descricao = p.descricao || p.nome || '';
    const quantidade = parseBrazilianFloat(p.qtd) || 1;
    const valorTotalItem = parseBrazilianFloat(p.normalizado_valor);

    let valorUnitario = parseBrazilianFloat(p.valor_unitario_comercial);
    if (!valorUnitario || valorUnitario <= 0) {
      const calc = quantidade > 0 ? valorTotalItem / quantidade : 0;
      valorUnitario = Number(calc.toFixed(6));
      console.log(`${LOG_PREFIX}    ⚠️ valor_unitario_comercial ausente em "${descricao}". Calculado: R$ ${valorUnitario.toFixed(4)} (${valorTotalItem} ÷ ${quantidade})`);
    }

    const eanLimpo = limparEAN(p.ean_comercial);
    const unidade = (p.unidade || 'UN').toString().toUpperCase();

    console.log(`${LOG_PREFIX}    📦 ${descricao} | qtd ${quantidade} ${unidade} | unit R$ ${valorUnitario.toFixed(2)} | total R$ ${valorTotalItem.toFixed(2)} | ean ${eanLimpo || '—'}`);

    return {
      codigo: p.codigo || null,
      nome: descricao,
      descricao,
      quantidade,
      quantidade_comercial: quantidade,
      unidade,
      unidade_comercial: unidade,
      valor_unitario: valorUnitario,
      valor_unitario_comercial: valorUnitario,
      valor_total: valorTotalItem || +(valorUnitario * quantidade).toFixed(2),
      normalizado_valor: valorTotalItem || +(valorUnitario * quantidade).toFixed(2),
      categoria: categorizarProduto(descricao),
      codigo_barras: eanLimpo,
      codigo_barras_comercial: eanLimpo,
      ean_comercial: eanLimpo,
      tem_desconto: false,
    };
  });

  const nomeOriginalEmitente = nfeData.emitente?.nome
    || nfeData.emitente?.nome_razao_social
    || nfeData.emitente?.nome_fantasia
    || 'Estabelecimento não identificado';

  const cnpjEmitente = (nfeData.emitente?.cnpj || '').replace(/\D/g, '');

  console.log(`${LOG_PREFIX} 🏪 Emitente original: "${nomeOriginalEmitente}" (CNPJ ${cnpjEmitente})`);

  let nomeNormalizadoEmitente = nomeOriginalEmitente;
  try {
    const { data: nomeNorm, error: normError } = await supabase.rpc('normalizar_nome_estabelecimento', {
      nome_input: nomeOriginalEmitente,
      cnpj_input: cnpjEmitente || null
    });
    if (normError) {
      console.error(`${LOG_PREFIX} ⚠️ Erro ao normalizar:`, normError);
    } else if (nomeNorm) {
      nomeNormalizadoEmitente = nomeNorm;
      console.log(`${LOG_PREFIX}    ✅ Normalizado para: "${nomeNormalizadoEmitente}"`);
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} ⚠️ Exceção ao normalizar:`, error);
  }

  const estabelecimento = {
    cnpj: cnpjEmitente,
    nome: nomeNormalizadoEmitente,
    nome_original: nomeOriginalEmitente,
    endereco: nfeData.emitente?.endereco
  };
  const emitente = { ...estabelecimento };

  // Data — parser seguro
  const dataEmissaoRaw = nfeData.nfe?.data_emissao
    || nfeData.informacoes_nota?.data_emissao
    || nfeData.data_emissao
    || null;
  const dataEmissaoISO = parseDataEmissao(dataEmissaoRaw);
  console.log(`${LOG_PREFIX} 📅 Data emissão: "${dataEmissaoRaw}" → ${dataEmissaoISO}`);

  const valorTotal = parseBrazilianFloat(
    nfeData.nfe?.normalizado_valor_total
    || nfeData.totais?.normalizado_valor_nfe
    || nfeData.normalizado_valor_total
    || nfeData.valor_total
  );

  const numeroNota = nfeData.nfe?.numero || nfeData.informacoes_nota?.numero || nfeData.numero;
  const serie = nfeData.nfe?.serie || nfeData.informacoes_nota?.serie || nfeData.serie;
  const formasPagamento = nfeData.formas_pagamento || nfeData.pagamento || [];

  const dadosExtraidos = {
    chave_acesso: chaveAcesso,
    numero_nota: numeroNota,
    serie,

    valor_total: valorTotal,
    total: valorTotal,
    valor_desconto_total: parseBrazilianFloat(nfeData.nfe?.normalizado_valor_desconto || nfeData.normalizado_valor_desconto || 0),
    quantidade_itens: produtos.length,
    data_emissao: dataEmissaoISO,

    produtos,
    itens: produtos,

    compra: {
      valor_total: valorTotal,
      data_emissao: dataEmissaoISO,
      hora_emissao: nfeData.nfe?.hora_emissao || nfeData.informacoes_nota?.hora_emissao || null,
      numero: numeroNota,
      serie,
      forma_pagamento: formasPagamento?.[0]?.forma || 'N/A'
    },

    estabelecimento,
    emitente,

    formas_pagamento: formasPagamento,
    origem_api: 'infosimples_nfe_ce',
    dados_api_brutos: dadosNFe,
    timestamp_processamento: new Date().toISOString()
  };

  console.log(`${LOG_PREFIX}    ✅ ${produtos.length} produtos | Total R$ ${valorTotal.toFixed(2)} | Emitente: ${estabelecimento.nome}`);

  const { error: updateError } = await supabase
    .from('notas_imagens')
    .update({
      processada: false,
      pdf_gerado: false,
      dados_extraidos: dadosExtraidos,
      status_processamento: 'aguardando_estoque',
      updated_at: new Date().toISOString()
    })
    .eq('id', notaImagemId)
    .eq('usuario_id', userId);

  if (updateError) {
    console.error(`${LOG_PREFIX} ❌ Erro ao atualizar notas_imagens:`, updateError);
    throw updateError;
  }
  console.log(`${LOG_PREFIX} ✅ Nota atualizada`);

  // Dispara finalização (fire-and-forget — cron retoma se falhar)
  supabase.functions.invoke('finalize-nota-estoque', {
    body: { notaImagemId },
  }).then((result: { error?: { message?: string } | null }) => {
    if (result.error) {
      console.warn(`${LOG_PREFIX} ⚠️ finalize-nota-estoque falhou (cron retomará):`, result.error.message);
    } else {
      console.log(`${LOG_PREFIX} ✅ finalize-nota-estoque disparado`);
    }
  }).catch((e: unknown) => {
    console.warn(`${LOG_PREFIX} ⚠️ erro ao disparar finalize:`, e instanceof Error ? e.message : String(e));
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { chaveAcesso, userId, notaImagemId } = await req.json();
    if (!chaveAcesso || !userId || !notaImagemId) {
      throw new Error('chaveAcesso, userId e notaImagemId são obrigatórios');
    }

    const chaveLimpa = String(chaveAcesso).replace(/\D/g, '');
    if (chaveLimpa.length !== 44 || chaveLimpa.substring(20, 22) !== '55') {
      throw new Error('A chave informada não é uma NF-e válida do modelo 55');
    }

    console.log(`${LOG_PREFIX} 📄 Iniciando (provider Ceará NFe)...`);
    console.log(`${LOG_PREFIX}    Chave: ${chaveLimpa.substring(0, 4)}...${chaveLimpa.substring(40)}`);
    console.log(`${LOG_PREFIX}    User: ${userId}`);
    console.log(`${LOG_PREFIX}    Nota ID: ${notaImagemId}`);

    let dadosNFe: any;
    const cached = await checkCache(supabase, chaveLimpa);
    if (cached) {
      console.log(`${LOG_PREFIX} 📋 Usando cache`);
      dadosNFe = cached.dados_completos;
    } else {
      dadosNFe = await consultarNFeCEInfoSimples(chaveLimpa);
      await saveToCache(supabase, chaveLimpa, dadosNFe);
    }

    await processarNFeCE(supabase, userId, notaImagemId, chaveLimpa, dadosNFe);

    return new Response(
      JSON.stringify({
        success: true,
        cached: !!cached,
        notaId: notaImagemId,
        provider: 'infosimples_nfe_ce',
        produtos: dadosNFe.data?.[0]?.produtos?.length || 0,
        valor_total: parseBrazilianFloat(dadosNFe.data?.[0]?.nfe?.normalizado_valor_total),
        message: cached ? 'NFe CE processada com sucesso (cache)' : 'NFe CE processada com sucesso (API InfoSimples)'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    if (error instanceof NfcePendenteSefazError) {
      console.warn(`${LOG_PREFIX} ⏳ Pendente SEFAZ — retornando 200 com pendente=true`);
      return new Response(
        JSON.stringify({
          success: false,
          pendente: true,
          motivo: error.motivo,
          detalhe: error.detalhe,
          message: 'NFe CE ainda não autorizada pela SEFAZ. Será reprocessada automaticamente.'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }
    console.error(`${LOG_PREFIX} ❌ Erro:`, error);
    return new Response(
      JSON.stringify({ error: (error as Error).message, details: 'Erro ao processar NFe CE via InfoSimples' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
});
