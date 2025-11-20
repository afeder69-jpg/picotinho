/**
 * 🎫 PROCESSAMENTO DE NFCe VIA INFOSIMPLES (RIO DE JANEIRO)
 * 
 * Este edge function é chamado automaticamente por process-url-nota
 * quando detecta uma NFCe (modelo 65) do estado do Rio de Janeiro (UF 33).
 * 
 * FLUXO AUTOMÁTICO:
 * 1. Recebe chaveNFCe de process-url-nota
 * 2. Verifica cache (nfce_cache_infosimples)
 * 3. Se não cached → consulta API InfoSimples (R$ 0,24)
 * 4. Categoriza produtos automaticamente
 * 5. Salva dados_extraidos em notas_imagens
 * 6. Frontend detecta via realtime → processamento automático
 * 
 * ⚠️ NÃO CHAMA process-receipt-full diretamente
 * O processamento do estoque é feito automaticamente pelo frontend
 * via realtime listener em BottomNavigation.tsx
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Categoriza produto usando as MESMAS regras do fluxo WhatsApp (extract-receipt-image)
 * ⚠️ CRÍTICO: Esta função replica EXATAMENTE a lógica do prompt da OpenAI + post-processing
 */
function categorizarProduto(descricao: string): string {
  const desc = descricao.toLowerCase();
  
  // 🥛 REGRA CRÍTICA: LEITE e derivados → laticínios/frios
  if (desc.includes('leite') && !desc.includes('leite de coco')) {
    return 'laticínios/frios';
  }
  if (desc.includes('queijo')) {
    return 'laticínios/frios';
  }
  if (desc.includes('iogurte')) {
    return 'laticínios/frios';
  }
  if (desc.includes('manteiga') || desc.includes('margarina')) {
    return 'laticínios/frios';
  }
  if (desc.includes('creme de leite') || desc.includes('leite condensado')) {
    return 'laticínios/frios';
  }
  if (desc.includes('requeijão') || desc.includes('requeijao')) {
    return 'laticínios/frios';
  }
  if (desc.includes('embutido') || desc.includes('presunto') || desc.includes('mortadela')) {
    return 'laticínios/frios';
  }
  
  // 🧹 LIMPEZA
  if (desc.includes('detergente') || desc.includes('sabao') || desc.includes('sabão')) {
    return 'limpeza';
  }
  if (desc.includes('desinfetante') || desc.includes('amaciante')) {
    return 'limpeza';
  }
  if (desc.includes('esponja') || desc.includes('bombril')) {
    return 'limpeza';
  }
  
  // 🍎 HORTIFRUTI
  if (desc.includes('tempero verde') || desc.includes('ervas frescas')) {
    return 'hortifruti';
  }
  if (desc.includes('fruta') || desc.includes('verdura') || desc.includes('legume')) {
    return 'hortifruti';
  }
  if (desc.includes('banana') || desc.includes('maçã') || desc.includes('maca') || desc.includes('laranja')) {
    return 'hortifruti';
  }
  if (desc.includes('tomate') || desc.includes('alface') || desc.includes('cebola') || desc.includes('batata')) {
    return 'hortifruti';
  }
  if (desc.includes('cenoura') || desc.includes('beterraba') || desc.includes('pepino')) {
    return 'hortifruti';
  }
  
  // 🛒 MERCEARIA
  if (desc.includes('arroz')) {
    return 'mercearia';
  }
  if (desc.includes('feijão') || desc.includes('feijao')) {
    return 'mercearia';
  }
  if (desc.includes('massa') || desc.includes('macarrão') || desc.includes('macarrao')) {
    return 'mercearia';
  }
  if (desc.includes('sal')) {
    return 'mercearia';
  }
  if (desc.includes('açúcar') || desc.includes('acucar')) {
    return 'mercearia';
  }
  if (desc.includes('óleo') || desc.includes('oleo') || desc.includes('azeite')) {
    return 'mercearia';
  }
  if (desc.includes('ovos')) {
    return 'mercearia';
  }
  if (desc.includes('milho') && (desc.includes('lata') || desc.includes('conserva') || desc.includes('verde'))) {
    return 'mercearia';
  }
  if (desc.includes('aveia')) {
    return 'mercearia';
  }
  if (desc.includes('conserva') || desc.includes('molho')) {
    return 'mercearia';
  }
  
  // 🥤 BEBIDAS (exceto leite, que já foi tratado)
  if (desc.includes('refrigerante') || desc.includes('suco')) {
    return 'bebidas';
  }
  if (desc.includes('água') || desc.includes('agua')) {
    return 'bebidas';
  }
  if (desc.includes('cerveja') || desc.includes('vinho')) {
    return 'bebidas';
  }
  if (desc.includes('energético') || desc.includes('energetico')) {
    return 'bebidas';
  }
  
  // 🧴 HIGIENE/FARMÁCIA
  if (desc.includes('sabonete') || desc.includes('shampoo') || desc.includes('condicionador')) {
    return 'higiene/farmácia';
  }
  if (desc.includes('pasta de dente') || desc.includes('escova de dente')) {
    return 'higiene/farmácia';
  }
  if (desc.includes('papel higiênico') || desc.includes('papel higienico')) {
    return 'higiene/farmácia';
  }
  if (desc.includes('medicamento') || desc.includes('remédio') || desc.includes('remedio')) {
    return 'higiene/farmácia';
  }
  if (desc.includes('desodorante') || desc.includes('perfume')) {
    return 'higiene/farmácia';
  }
  
  // 🥩 AÇOUGUE
  if (desc.includes('carne') || desc.includes('bife') || desc.includes('picanha')) {
    return 'açougue';
  }
  if (desc.includes('frango') || desc.includes('peito') || desc.includes('coxa')) {
    return 'açougue';
  }
  if (desc.includes('peixe') || desc.includes('salmão') || desc.includes('salmao') || desc.includes('tilápia') || desc.includes('tilapia')) {
    return 'açougue';
  }
  if (desc.includes('linguiça') || desc.includes('linguica')) {
    return 'açougue';
  }
  
  // 🍞 PADARIA
  if (desc.includes('pão') || desc.includes('pao')) {
    return 'padaria';
  }
  if (desc.includes('bolo') || desc.includes('biscoito') || desc.includes('torrada')) {
    return 'padaria';
  }
  
  // ❄️ CONGELADOS
  if (desc.includes('sorvete') || desc.includes('congelado')) {
    return 'congelados';
  }
  if (desc.includes('pizza') && desc.includes('congelad')) {
    return 'congelados';
  }
  
  // 🐾 PET
  if (desc.includes('ração') || desc.includes('racao') || desc.includes('pet')) {
    return 'pet';
  }
  
  // ⚠️ OUTROS (apenas quando não se encaixa em nenhuma categoria)
  return 'outros';
}

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
        data_emissao: info?.data_emissao || null,
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
    const temDesconto = valorDesconto > 0;
    
    // ✅ Valor extraído (pode ser total ou unitário dependendo do produto)
    const valorExtraido = parseFloat(
      p.normalizado_valor ||          // ← Prioridade 1: número correto
      p.valor ||                      // ← Prioridade 2: fallback
      p.valor_unitario_comercial ||   // ← Prioridade 3: último recurso
      '0'
    );
    
    // ✅ Quantidade do produto
    const quantidade = parseFloat(
      p.qtd || 
      p.quantidade_comercial || 
      p.quantidade || 
      '1'
    );
    
    // Para produtos pesáveis (kg), normalizado_valor É o valor total da linha
    // Precisamos dividir pela quantidade para obter o preço unitário (R$/kg)
    const unidade = (p.unidade || 'UN').toUpperCase();
    const ehProdutoPesavel = unidade === 'KG' || unidade === 'G' || unidade === 'L' || unidade === 'ML';

    const valorUnitarioReal = ehProdutoPesavel && quantidade > 0
      ? valorExtraido / quantidade  // Dividir pelo peso/volume para obter R$/kg
      : valorExtraido;              // Usar direto para unidades

    console.log(`   💰 [${p.descricao}] Valor extraído: R$ ${valorExtraido.toFixed(2)} | Qtd: ${quantidade} ${unidade} | Preço unitário: R$ ${valorUnitarioReal.toFixed(2)}${ehProdutoPesavel ? '/kg' : ''}`);

    // 🔍 INVESTIGAÇÃO: Como InfoSimples envia os descontos?
    if (temDesconto) {
      console.log(`   🏷️ [DESCONTO] ${p.descricao}:`);
      console.log(`      - normalizado_valor (API): R$ ${valorExtraido.toFixed(2)}`);
      console.log(`      - valor_desconto (API): R$ ${valorDesconto.toFixed(2)}`);
      console.log(`      - Quantidade: ${quantidade} ${unidade}`);
      console.log(`      - Preço unitário calculado: R$ ${valorUnitarioReal.toFixed(2)}`);
      console.log(`      - É pesável?: ${ehProdutoPesavel}`);
      
      // Verificar se normalizado_valor já inclui desconto
      const valorSemDesconto = valorUnitarioReal + valorDesconto;
      console.log(`      - Se JÁ incluir desconto: preço original seria R$ ${valorSemDesconto.toFixed(2)}`);
      console.log(`      - Se NÃO incluir desconto: preço final seria R$ ${(valorUnitarioReal - valorDesconto).toFixed(2)}`);
    }

    // 🆕 TESTAR: Não aplicar desconto em produtos pesáveis (pode já estar aplicado no valor total)
    const aplicarDesconto = temDesconto && !ehProdutoPesavel;

    // Preço FINAL = preço unitário - desconto (apenas se aplicável)
    const valorUnitarioFinal = aplicarDesconto
      ? valorUnitarioReal - valorDesconto
      : valorUnitarioReal;

    if (temDesconto) {
      console.log(`      - ✅ Decisão: ${aplicarDesconto ? 'APLICAR' : 'NÃO APLICAR'} desconto | Valor final: R$ ${valorUnitarioFinal.toFixed(2)}`);
    }
    
    // ✅ Calcular valor total (valor unitário × quantidade)
    const valorTotalFinal = valorUnitarioFinal * quantidade;
    
    if (temDesconto) {
      produtosComDesconto++;
      economiaTotal += valorDesconto * quantidade;
    }
    
    // 🔍 Debug de valores extraídos
    console.log(`   📦 ${p.descricao || p.nome}:`);
    console.log(`      - normalizado_valor: ${p.normalizado_valor}`);
    console.log(`      - valor: ${p.valor}`);
    console.log(`      - unidade: ${unidade} (pesável: ${ehProdutoPesavel})`);
    console.log(`      - valor extraído: ${valorExtraido}`);
    console.log(`      - 💰 Valor unitário real: ${valorUnitarioReal}`);
    console.log(`      - 📊 Qtd: ${quantidade} | Total: ${valorTotalFinal}`);
    
    return {
      codigo: p.codigo,
      nome: p.nome || p.descricao,
      quantidade: quantidade,
      unidade: p.unidade || 'UN',
      valor_unitario: valorUnitarioFinal,
      valor_total: valorTotalFinal,
      categoria: categorizarProduto(p.nome || p.descricao), // ✅ CATEGORIZAÇÃO IDÊNTICA AO WHATSAPP
      tem_desconto: temDesconto,
      _valor_desconto_aplicado: temDesconto ? valorDesconto : undefined,
      _valor_original: temDesconto ? valorExtraido : undefined
    };
  }) || [];

  // ✅ Priorizar nome_razao_social (nome real) sobre nome_fantasia (pode ser código)
  const nomeOriginalEmitente = nfceData.emitente?.nome_razao_social || 
                                nfceData.emitente?.nome_fantasia || 
                                nfceData.emitente?.nome ||
                                'Estabelecimento não identificado';

  const cnpjEmitente = nfceData.emitente?.cnpj?.replace(/\D/g, '');
  
  console.log(`🏪 Nome original do emitente: "${nomeOriginalEmitente}"`);
  console.log(`🔑 CNPJ do emitente: "${cnpjEmitente}"`);

  // ✅ Aplicar normalização usando a função do banco (COM CNPJ!)
  let nomeNormalizadoEmitente = nomeOriginalEmitente;
  try {
    const { data: nomeNorm, error: normError } = await supabase.rpc('normalizar_nome_estabelecimento', {
      nome_input: nomeOriginalEmitente,
      cnpj_input: cnpjEmitente || null
    });
    
    if (normError) {
      console.error('⚠️ Erro ao normalizar estabelecimento:', normError);
    } else if (nomeNorm) {
      nomeNormalizadoEmitente = nomeNorm;
      console.log(`   ✅ Normalizado para: "${nomeNormalizadoEmitente}"`);
    }
  } catch (error) {
    console.error('⚠️ Exceção ao normalizar:', error);
  }

  const emitente = {
    cnpj: cnpjEmitente,
    nome: nomeNormalizadoEmitente,
    nome_original: nomeOriginalEmitente,
    endereco: nfceData.emitente?.endereco
  };

  // ✅ Criar estabelecimento no formato esperado pelo frontend
  const estabelecimento = {
    cnpj: cnpjEmitente,
    nome: nomeNormalizadoEmitente,
    nome_original: nomeOriginalEmitente,
    endereco: nfceData.emitente?.endereco
  };

  // Extrair informações da nota
  const infoNota = nfceData.informacoes_nota || nfceData;
  
  // ✅ Buscar data no local correto da estrutura InfoSimples
  const dataEmissaoRaw = nfceData.nfe?.dhEmi || 
                         nfceData.nfe?.data_emissao || 
                         infoNota?.data_emissao || 
                         nfceData.data_emissao;

  // ✅ Converter para ISO (a API já retorna em formato parseável)
  let dataEmissaoISO = null;
  if (dataEmissaoRaw) {
    try {
      // Se vier em formato brasileiro DD/MM/YYYY HH:mm:ss
      if (dataEmissaoRaw.includes('/')) {
        // Separar data e hora corretamente
        const partes = dataEmissaoRaw.split(' ');
        const dataParte = partes[0]; // "26/10/2025"
        const horaParte = partes[1]?.split('-')[0] || '00:00:00'; // "12:35:25" (remove timezone)
        
        const [dia, mes, ano] = dataParte.split('/');
        
        // Validar que temos todos os componentes
        if (dia && mes && ano) {
          dataEmissaoISO = `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}T${horaParte}`;
        }
      } else {
        // Se vier em formato ISO (2025-10-04T09:43:14-03:00)
        dataEmissaoISO = new Date(dataEmissaoRaw).toISOString();
      }
    } catch (error) {
      console.error('⚠️ Erro ao parsear data:', dataEmissaoRaw, error);
      dataEmissaoISO = null;
    }
  }

  console.log(`📅 Data emissão extraída: ${dataEmissaoRaw} → ${dataEmissaoISO}`);
  
  // ✅ Calcular valor total correto
  const valorTotal = parseFloat(
    nfceData.totais?.normalizado_valor_nfe || 
    nfceData.nfe?.normalizado_valor_total ||
    nfceData.valor_total || 
    '0'
  );
  
  const dadosExtraidos = {
    chave_acesso: (infoNota?.chave_acesso || nfceData.chave)?.replace(/\s/g, ''),
    numero_nota: infoNota?.numero || nfceData.numero,
    serie: infoNota?.serie || nfceData.serie,
    
    // ✅ CRÍTICO: Salvar HTML da nota para fallback
    html_capturado: nfceData.site_receipt || null,
    
    // ✅ Valores numéricos no root para compatibilidade
    valor_total: valorTotal,
    valor_desconto_total: parseFloat(
      nfceData.normalizado_valor_desconto || 
      nfceData.valor_desconto || 
      '0'
    ),
    quantidade_itens: parseInt(
      nfceData.normalizado_quantidade_total_items || 
      nfceData.quantidade_itens || 
      produtos.length.toString()
    ),
    
    // ✅ ESTRUTURA CORRETA: Produtos em "itens" (não "produtos")
    itens: produtos,
    
    // ✅ ESTRUTURA CORRETA: Dados da compra agrupados
    compra: {
      valor_total: valorTotal,
      data_emissao: dataEmissaoISO,
      hora_emissao: infoNota?.hora_emissao || nfceData.hora_emissao,
      numero: infoNota?.numero || nfceData.numero,
      serie: infoNota?.serie || nfceData.serie,
      forma_pagamento: nfceData.formas_pagamento?.[0]?.forma || nfceData.pagamento?.[0]?.forma || 'N/A'
    },
    
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
      pdf_gerado: false, // 🔥 Novo: flag para controlar geração de PDF
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
    // ⚠️ IMPORTANTE: O processamento do estoque é AUTOMÁTICO via realtime listener no frontend
    // O BottomNavigation.tsx detecta quando dados_extraidos é preenchido e chama automaticamente
    // a função processarNotaAutomaticamente() → validate-receipt → process-receipt-full
    if (notaImagemId) {
      await processarNFCe(supabase, userId, notaImagemId, dadosNFCe, '');
      console.log('✅ [PROCESSAR] Dados salvos em notas_imagens. Frontend detectará via realtime e processará automaticamente.');
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
