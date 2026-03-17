import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function parseBrazilianFloat(valor: string | number | undefined | null): number {
  if (valor === undefined || valor === null || valor === '') return 0;
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : 0;

  const valorLimpo = String(valor)
    .trim()
    .replace(/\./g, '')
    .replace(',', '.');

  return parseFloat(valorLimpo) || 0;
}

function limparDigitos(valor: string | undefined | null): string | null {
  if (!valor) return null;
  const limpo = String(valor).replace(/\D/g, '');
  return limpo || null;
}

function firstNonEmpty<T = any>(...values: T[]): T | null {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }
  return null;
}

function categorizarProduto(descricao: string): string {
  const desc = descricao.toLowerCase();

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

interface CacheEntry {
  id: string;
  chave_nfe: string;
  dados_completos: any;
  total_consultas: number;
}

async function checkCache(supabase: any, chaveNFe: string): Promise<CacheEntry | null> {
  const { data, error } = await supabase
    .from('nfe_cache_serpro')
    .select('*')
    .eq('chave_nfe', chaveNFe)
    .single();

  if (error) {
    if (error.code !== 'PGRST116') {
      console.error('⚠️ [CACHE-NFE] Erro ao consultar cache:', error);
    }
    return null;
  }

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

async function saveToCache(supabase: any, chaveNFe: string, dadosNFe: any): Promise<void> {
  const nota = dadosNFe.data?.[0] ?? {};
  const emitente = nota.emitente ?? nota.emit ?? {};
  const informacoesNota = nota.informacoes_nota ?? nota.nfe ?? {};

  const { error } = await supabase
    .from('nfe_cache_serpro')
    .insert({
      chave_nfe: chaveNFe,
      cnpj_emitente: limparDigitos(firstNonEmpty(emitente.cnpj, emitente.CNPJ)),
      nome_emitente: firstNonEmpty(emitente.nome_razao_social, emitente.xNome, emitente.nome_fantasia),
      data_emissao: firstNonEmpty(informacoesNota.data_emissao, informacoesNota.dhEmi, nota.data_emissao),
      valor_total: parseBrazilianFloat(firstNonEmpty(nota.normalizado_valor_total, nota.valor_total, nota.valor_a_pagar)),
      dados_completos: dadosNFe,
      consultado_em: new Date().toISOString(),
      ultima_consulta: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

  if (error) {
    console.error('⚠️ [CACHE-NFE] Erro ao salvar cache:', error);
  }
}

async function consultarNFeInfoSimples(chaveNFe: string): Promise<any> {
  const token = Deno.env.get('INFOSIMPLES_TOKEN');

  if (!token) {
    throw new Error('Token InfoSimples não configurado');
  }

  const response = await fetch('https://api.infosimples.com/api/v2/consultas/receita-federal/nfe', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      token,
      nfe: chaveNFe,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`InfoSimples API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();

  if (data.code && data.code !== 200) {
    throw new Error(`InfoSimples error: ${data.code_message || data.message || 'consulta sem sucesso'}`);
  }

  return data;
}

function mapearProdutos(nfeData: any) {
  const itensBrutos = firstNonEmpty<any[]>(
    nfeData.produtos,
    nfeData.itens,
    nfeData.det,
    nfeData.nfe?.produtos,
    []
  ) || [];

  return itensBrutos.map((item: any, index: number) => {
    const prod = item.prod ?? item;
    const nome = String(firstNonEmpty(
      prod.nome,
      prod.descricao,
      prod.xProd,
      prod.produto,
      `Item ${index + 1}`
    ));

    const quantidade = parseBrazilianFloat(firstNonEmpty(
      prod.quantidade,
      prod.qtd,
      prod.quantidade_comercial,
      prod.qCom,
      1
    )) || 1;

    const unidade = String(firstNonEmpty(
      prod.unidade,
      prod.unidade_comercial,
      prod.uCom,
      'UN'
    )).toUpperCase();

    const valorUnitario = parseBrazilianFloat(firstNonEmpty(
      prod.valor_unitario,
      prod.valor_unitario_comercial,
      prod.vUnCom,
      prod.valor,
      prod.vProd
    ));

    const valorTotal = parseBrazilianFloat(firstNonEmpty(
      prod.valor_total,
      prod.vProd,
      quantidade * valorUnitario
    ));

    return {
      codigo: firstNonEmpty(prod.codigo, prod.cProd, prod.codigo_produto),
      nome,
      quantidade,
      unidade,
      valor_unitario: valorUnitario,
      valor_total: valorTotal || quantidade * valorUnitario,
      categoria: categorizarProduto(nome),
      codigo_barras: limparDigitos(firstNonEmpty(
        prod.codigo_barras_comercial,
        prod.ean_comercial,
        prod.codigo_barras,
        prod.cEAN,
        prod.cEANTrib,
        prod.codigo_barras_tributavel
      )),
      ean_comercial: limparDigitos(firstNonEmpty(
        prod.ean_comercial,
        prod.codigo_barras_comercial,
        prod.cEAN
      )),
    };
  });
}

async function processarNFe(supabase: any, userId: string, notaImagemId: string, chaveAcesso: string, dadosNFe: any): Promise<void> {
  const nfeData = dadosNFe.data?.[0];

  if (!nfeData) {
    throw new Error('Dados da NF-e não encontrados na resposta do InfoSimples');
  }

  const produtos = mapearProdutos(nfeData);
  const emitenteBruto = nfeData.emitente ?? nfeData.emit ?? {};
  const informacoesNota = nfeData.informacoes_nota ?? nfeData.nfe ?? {};
  const cnpjEmitente = limparDigitos(firstNonEmpty(emitenteBruto.cnpj, emitenteBruto.CNPJ));
  const nomeOriginalEmitente = String(firstNonEmpty(
    emitenteBruto.nome_razao_social,
    emitenteBruto.xNome,
    emitenteBruto.nome_fantasia,
    emitenteBruto.nome,
    'Estabelecimento não identificado'
  ));

  let nomeNormalizadoEmitente = nomeOriginalEmitente;
  try {
    const { data: nomeNorm, error: normError } = await supabase.rpc('normalizar_nome_estabelecimento', {
      nome_input: nomeOriginalEmitente,
      cnpj_input: cnpjEmitente || null,
    });

    if (!normError && nomeNorm) {
      nomeNormalizadoEmitente = nomeNorm;
    }
  } catch (error) {
    console.error('⚠️ [NFE-INFOSIMPLES] Erro ao normalizar estabelecimento:', error);
  }

  const endereco = firstNonEmpty(
    emitenteBruto.endereco,
    emitenteBruto.enderEmit ? `${emitenteBruto.enderEmit.xLgr || ''}, ${emitenteBruto.enderEmit.nro || ''} - ${emitenteBruto.enderEmit.xBairro || ''}, ${emitenteBruto.enderEmit.xMun || ''} - ${emitenteBruto.enderEmit.UF || ''}`.trim() : null,
    nfeData.endereco_emitente,
  );

  const valorTotal = parseBrazilianFloat(firstNonEmpty(
    nfeData.normalizado_valor_total,
    nfeData.valor_total,
    nfeData.total?.ICMSTot?.vNF,
    informacoesNota.valor_total,
  ));

  const dataEmissao = firstNonEmpty(
    informacoesNota.data_emissao,
    informacoesNota.dhEmi,
    nfeData.data_emissao,
    nfeData.nfe?.dhEmi,
  );

  const estabelecimento = {
    cnpj: cnpjEmitente,
    nome: nomeNormalizadoEmitente,
    nome_original: nomeOriginalEmitente,
    endereco,
  };

  const dadosExtraidos = {
    chave_acesso: chaveAcesso,
    numero_nota: firstNonEmpty(informacoesNota.numero, informacoesNota.nNF, nfeData.numero),
    serie: firstNonEmpty(informacoesNota.serie, nfeData.serie),
    valor_total: valorTotal,
    quantidade_itens: produtos.length,
    itens: produtos,
    compra: {
      valor_total: valorTotal,
      data_emissao: dataEmissao,
      numero: firstNonEmpty(informacoesNota.numero, informacoesNota.nNF, nfeData.numero),
      serie: firstNonEmpty(informacoesNota.serie, nfeData.serie),
      forma_pagamento: firstNonEmpty(nfeData.formas_pagamento?.[0]?.forma, nfeData.pagamento?.[0]?.forma, 'N/A'),
    },
    estabelecimento,
    emitente: estabelecimento,
    formas_pagamento: firstNonEmpty(nfeData.formas_pagamento, nfeData.pagamento, []),
    origem_api: 'infosimples_nfe',
    dados_api_brutos: dadosNFe,
    timestamp_processamento: new Date().toISOString(),
  };

  const { error: updateError } = await supabase
    .from('notas_imagens')
    .update({
      processada: true,
      pdf_gerado: false,
      dados_extraidos: dadosExtraidos,
      updated_at: new Date().toISOString(),
    })
    .eq('id', notaImagemId)
    .eq('usuario_id', userId);

  if (updateError) {
    throw updateError;
  }
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

    let dadosNFe: any;
    const cached = await checkCache(supabase, chaveLimpa);

    if (cached) {
      dadosNFe = cached.dados_completos;
    } else {
      dadosNFe = await consultarNFeInfoSimples(chaveLimpa);
      await saveToCache(supabase, chaveLimpa, dadosNFe);
    }

    await processarNFe(supabase, userId, notaImagemId, chaveLimpa, dadosNFe);

    return new Response(
      JSON.stringify({
        success: true,
        cached: !!cached,
        notaId: notaImagemId,
        produtos: (dadosNFe.data?.[0]?.produtos || dadosNFe.data?.[0]?.itens || dadosNFe.data?.[0]?.det || []).length,
        valor_total: dadosNFe.data?.[0]?.normalizado_valor_total || dadosNFe.data?.[0]?.valor_total || null,
        message: cached
          ? 'NF-e processada com sucesso (cache)'
          : 'NF-e processada com sucesso (API InfoSimples)',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('❌ [NFE-INFOSIMPLES] Erro:', error);

    return new Response(
      JSON.stringify({
        error: error.message,
        details: 'Erro ao processar NF-e via InfoSimples',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});