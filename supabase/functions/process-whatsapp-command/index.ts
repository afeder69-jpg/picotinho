import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ProcessCommandRequest {
  messageId: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('📱 Processando comando WhatsApp...');

    // Inicializar Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { messageId }: ProcessCommandRequest = await req.json();
    
    console.log(`🚀 [INICIO] Processando messageId: ${messageId}`);

    // Buscar mensagem para processar (REMOVENDO filtro processada=false)
    const { data: mensagem, error: erroMensagem } = await supabase
      .from('whatsapp_mensagens')
      .select('*')
      .eq('id', messageId)
      .maybeSingle();

    if (erroMensagem || !mensagem) {
      console.error('❌ Mensagem não encontrada:', erroMensagem);
      return new Response('Mensagem não encontrada', { status: 404, headers: corsHeaders });
    }

    console.log('📨 Processando mensagem:', mensagem.conteudo);

    // Verificar se existe sessão pendente para o usuário PRIMEIRO
    console.log(`🔍 [DEBUG] Buscando sessão para usuário: ${mensagem.usuario_id}, remetente: ${mensagem.remetente}`);
    console.log(`🔍 [DEBUG] Data atual: ${new Date().toISOString()}`);
    
    const { data: sessoesAtivas, error: sessaoError } = await supabase
      .from('whatsapp_sessions')
      .select('*')
      .eq('usuario_id', mensagem.usuario_id)
      .eq('remetente', mensagem.remetente)
      .order('created_at', { ascending: false });
    
    console.log(`🔍 [DEBUG] Todas as sessões encontradas:`, JSON.stringify(sessoesAtivas, null, 2));
    console.log(`🔍 [DEBUG] Erro na busca:`, sessaoError);
    
    // Filtrar sessões não expiradas manualmente para debug
    const agora = new Date();
    console.log(`🔍 [DEBUG] Data agora:`, agora.toISOString());
    
    const sessao = sessoesAtivas?.find(s => {
      const expira = new Date(s.expires_at);
      const ativa = expira > agora;
      console.log(`🔍 [DEBUG] Sessão ${s.id}: expira em ${expira.toISOString()}, ativa: ${ativa}`);
      return ativa;
    });
    
    console.log(`🔍 [DEBUG] Sessão ativa encontrada:`, sessao ? `ID: ${sessao.id}, Estado: ${sessao.estado}` : 'NENHUMA');

    let resposta = "Olá! Sou o Picotinho 🤖\n\n";
    let comandoExecutado = false;

    // PRIORIDADE 1: Se há sessão pendente, processar como resposta a um estado anterior
    if (sessao) {
      console.log(`📞 Sessão encontrada: ${sessao.estado} para produto ${sessao.produto_nome}`);
      console.log(`📞 Processando resposta para sessão: ${sessao.estado}`);
      console.log(`📞 Conteúdo da mensagem: "${mensagem.conteudo}"`);
      
      // FORÇAR o processamento da sessão - não permitir que vá para outros comandos
      try {
        resposta += await processarRespostaSessao(supabase, mensagem, sessao);
        comandoExecutado = true;
        
        // Marcar mensagem como processada IMEDIATAMENTE após processar sessão
        await supabase
          .from('whatsapp_mensagens')
          .update({
            processada: true,
            data_processamento: new Date().toISOString(),
            comando_identificado: `sessao_${sessao.estado}`
          })
          .eq('id', mensagem.id);
          
        console.log(`✅ Sessão processada e mensagem marcada como processada`);
      } catch (error) {
        console.error(`❌ Erro ao processar sessão:`, error);
        resposta += `❌ Erro ao processar sua resposta. Tente novamente.`;
      }
    } else {
      // LIMPAR SESSÕES EXPIRADAS ANTES DE PROCESSAR NOVO COMANDO
      await supabase
        .from('whatsapp_sessions')
        .delete()
        .eq('usuario_id', mensagem.usuario_id)
        .eq('remetente', mensagem.remetente)
        .lt('expires_at', new Date().toISOString());

      // PRIORIDADE 2: Verificar comandos novos
      // Verificar sinal de menos ANTES da normalização para não perder o símbolo
      const temSinalMenos = /^\s*-\s*\d/.test(mensagem.conteudo);
      
      console.log(`🔍 [DEBUG] Conteudo original: "${mensagem.conteudo}"`);
      console.log(`🔍 [DEBUG] Tem sinal menos:`, temSinalMenos);
      
      const textoNormalizado = mensagem.conteudo.toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Remove acentos
        .replace(/[^\w\s]/gi, ""); // Remove pontuação
      
      // Comandos para BAIXAR ESTOQUE
      const isBaixar = textoNormalizado.match(/\b(baixa|baixar|retirar|remover)\b/) || temSinalMenos;
      
      console.log(`🔍 [DEBUG] isBaixar result:`, isBaixar);
      
      // Comandos para AUMENTAR ESTOQUE
      const isAumentar = textoNormalizado.match(/\b(aumenta|aumentar|soma|somar|adiciona|adicionar)\b/);
      console.log(`🔍 [DEBUG] Texto normalizado: "${textoNormalizado}"`);
      console.log(`🔍 [DEBUG] isAumentar result:`, isAumentar);
      
      // Comandos para ADICIONAR PRODUTO NOVO
      const isAdicionar = textoNormalizado.match(/\b(adicionar|adiciona|cadastrar produto|inserir produto|botar produto)\b/);
      
      // Comandos para CONSULTAR ESTOQUE
      const isConsultar = textoNormalizado.match(/\b(consulta|consultar)\b/);
      
      // Comandos para CONSULTAR CATEGORIA (requer palavra "categoria" explícita)
      const isConsultarCategoria = textoNormalizado.includes('categoria') && textoNormalizado.match(/\b(consulta|consultar)\b/);
      
      // VERIFICAÇÃO ESPECIAL: Se não há sessão ativa mas mensagem é um número simples,
      // verificar se pode ser resposta a uma sessão que não foi encontrada
      const isNumeroSimples = /^\s*\d+\s*$/.test(mensagem.conteudo);
      
      if (isNumeroSimples) {
        console.log(`🔢 [ESPECIAL] Número simples detectado: "${mensagem.conteudo}" - verificando sessões não expiradas`);
        
        // Buscar QUALQUER sessão não expirada para este usuário
        const { data: sessaoAlternativa } = await supabase
          .from('whatsapp_sessions')
          .select('*')
          .eq('usuario_id', mensagem.usuario_id)
          .eq('remetente', mensagem.remetente)
          .gte('expires_at', new Date().toISOString())
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
          
        if (sessaoAlternativa) {
          console.log(`🔢 [ESPECIAL] Sessão alternativa encontrada: ${sessaoAlternativa.estado} - processando número como resposta`);
          resposta += await processarRespostaSessao(supabase, mensagem, sessaoAlternativa);
          comandoExecutado = true;
        }
      }
      
      if (!comandoExecutado) {
        if (isBaixar) {
          console.log('📉 Comando BAIXAR identificado:', temSinalMenos ? 'simbolo menos' : textoNormalizado);
          resposta += await processarBaixarEstoque(supabase, mensagem);
          comandoExecutado = true;
        } else if (isAumentar) {
          console.log('📈 Comando AUMENTAR identificado:', textoNormalizado);
          resposta += await processarAumentarEstoque(supabase, mensagem);
          comandoExecutado = true;
        } else if (isAdicionar) {
          console.log('➕ Comando ADICIONAR identificado:', textoNormalizado);
          resposta += await processarAdicionarProduto(supabase, mensagem);
          comandoExecutado = true;
        } else if (isConsultarCategoria) {
          console.log('📂 Comando CONSULTAR CATEGORIA identificado:', textoNormalizado);
          resposta += await processarConsultarCategoria(supabase, mensagem);
          comandoExecutado = true;
        } else if (isConsultar) {
          console.log('🔍 Comando CONSULTAR identificado:', textoNormalizado);
          resposta += await processarConsultarEstoque(supabase, mensagem);
          comandoExecutado = true;
        } else {
          // PRIORIDADE 3: Fallback para comandos não reconhecidos
          console.log('❌ Comando não reconhecido:', textoNormalizado);
          resposta += "❌ Desculpe, não entendi o comando. Tente novamente no formato: 'Picotinho, consulta [produto]'.";
        }
      }
    }

    // Enviar resposta via Z-API
    const respostaEnviada = await enviarRespostaWhatsApp(mensagem.remetente, resposta);

    // Marcar mensagem como processada
    await supabase
      .from('whatsapp_mensagens')
      .update({
        processada: true,
        data_processamento: new Date().toISOString(),
        resposta_enviada: resposta
      })
      .eq('id', messageId);

    console.log('✅ Comando processado com sucesso');

    return new Response(JSON.stringify({
      success: true,
      comando_executado: comandoExecutado,
      resposta_enviada: respostaEnviada
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('❌ Erro ao processar comando:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
};

// Função auxiliar para normalizar nomes de produtos
function normalizarNomeProduto(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Remove acentos
    .replace(/[^\w\s]/gi, "") // Remove pontuação
    .trim();
}

// Função auxiliar para normalizar unidades
function normalizarUnidade(unidade: string): string {
  const unidadeLower = unidade.toLowerCase();
  
  // Variações de "unidade"
  if (unidadeLower.match(/^(unidade|unid|und|un)$/)) {
    return 'un';
  }
  
  // Outras unidades mantêm o padrão original
  return unidadeLower;
}

/**
 * Processar comando de baixar estoque
 */
async function processarBaixarEstoque(supabase: any, mensagem: any): Promise<string> {
  try {
    console.log('📦 Processando comando baixar estoque...');
    
    // Extrair produto e quantidade do texto com normalização
    const texto = normalizarNomeProduto(mensagem.conteudo);
    
    // Regex para extrair quantidade e produto (incluindo "k" e "gr")
    const regexQuantidade = /(\d+(?:[.,]\d+)?)\s*(kg|k|kilos?|quilos?|g|gr|gramas?|l|litros?|ml|unidade|unid|und|un|pacote)?\s*(?:de\s+)?(.+)/i;
    
    // Limpar texto removendo comando e símbolo de menos
    let textoLimpo = texto.replace(/picotinho\s*(baixa?|baixar?)\s*/i, '');
    textoLimpo = textoLimpo.replace(/^\s*-\s*/, '');
    
    const match = textoLimpo.match(regexQuantidade);
    
    if (!match) {
      return "Não consegui entender a quantidade e produto. Tente: 'Picotinho, baixa 1 kg de banana'";
    }
    
    let quantidade = parseFloat(match[1].replace(',', '.'));
    let unidadeExtraida = match[2] ? normalizarUnidade(match[2]) : null;
    const produtoNomeOriginal = match[3].trim();
    const produtoNomeNormalizado = normalizarNomeProduto(produtoNomeOriginal);
    
    console.log(`📊 Extraído: ${quantidade} ${unidadeExtraida || 'sem unidade'} de ${produtoNomeOriginal}`);
    
    // Buscar produto no estoque usando nomes normalizados
    const { data: estoques, error: erroEstoque } = await supabase
      .from('estoque_app')
      .select('*')
      .eq('user_id', mensagem.usuario_id);
    
    if (erroEstoque) {
      console.error('❌ Erro ao buscar estoque:', erroEstoque);
      return "Erro ao consultar estoque. Tente novamente.";
    }
    
    // Buscar produto comparando nomes normalizados
    const estoque = estoques?.find((item: any) => {
      const nomeEstoqueNormalizado = normalizarNomeProduto(item.produto_nome);
      return nomeEstoqueNormalizado.includes(produtoNomeNormalizado) || 
             produtoNomeNormalizado.includes(nomeEstoqueNormalizado);
    });
    
    if (erroEstoque) {
      console.error('❌ Erro ao buscar estoque:', erroEstoque);
      return "Erro ao consultar estoque. Tente novamente.";
    }
    
    if (!estoque) {
      return `Produto "${produtoNome}" não encontrado no seu estoque.`;
    }
    
    // Converter unidades se necessário (CORRIGIDO: kg vs g)
    let quantidadeConvertida = quantidade;
    let unidadeFinal = unidadeExtraida;
    
    if (unidadeExtraida) {
      // Se foi especificada uma unidade na mensagem
      if (unidadeExtraida.match(/^(g|gr|gramas?)$/)) {
        // Converter gramas para kg (divide por 1000)
        quantidadeConvertida = quantidade / 1000;
        unidadeFinal = 'g';
        console.log(`🔄 Convertendo ${quantidade} g → ${quantidadeConvertida} kg`);
      } else if (unidadeExtraida.match(/^(kg|k|kilos?|quilos?)$/)) {
        // Manter como kg (sem conversão)
        quantidadeConvertida = quantidade;
        unidadeFinal = 'kg';
        console.log(`✅ Mantendo ${quantidade} kg → ${quantidadeConvertida} kg`);
      } else {
        // Usar a unidade especificada sem conversão
        quantidadeConvertida = quantidade;
      }
    } else {
      // Se não foi especificada unidade, usar a unidade do estoque
      quantidadeConvertida = quantidade;
      unidadeFinal = estoque.unidade_medida;
    }
    
    console.log(`📊 Quantidade convertida: ${quantidadeConvertida} (original: ${quantidade} ${unidadeExtraida || 'sem unidade'})`);
    
    // Verificar se há quantidade suficiente
    if (estoque.quantidade < quantidadeConvertida) {
      const estoqueFormatado = formatarQuantidade(estoque.quantidade, estoque.unidade_medida);
      const tentouBaixarFormatado = formatarQuantidade(quantidade, unidadeFinal || estoque.unidade_medida);
      
      return `❌ Estoque insuficiente!\n\nVocê tem: ${estoqueFormatado}\nTentou baixar: ${tentouBaixarFormatado}\n\nQuantidade disponível: ${estoqueFormatado}`;
    }
    
    // Baixar do estoque
    let novaQuantidade = estoque.quantidade - quantidadeConvertida;
    
    // Arredondar SEMPRE com 3 casas decimais para precisão de miligrama
    novaQuantidade = Math.round(novaQuantidade * 1000) / 1000;
    
    if (novaQuantidade <= 0) {
      // Remover produto do estoque se ficou zerado
      await supabase
        .from('estoque_app')
        .delete()
        .eq('id', estoque.id);
        
      const baixadoFormatado = formatarQuantidade(quantidade, unidadeFinal || estoque.unidade_medida);
      return `✅ Produto retirado do estoque!\n\n📦 ${estoque.produto_nome}\n🔢 Baixado: ${baixadoFormatado}\n📊 Estoque atual: 0 (produto removido)`;
    } else {
      // Atualizar quantidade
      await supabase
        .from('estoque_app')
        .update({
          quantidade: novaQuantidade,
          updated_at: new Date().toISOString()
        })
        .eq('id', estoque.id);
        
      const baixadoFormatado = formatarQuantidade(quantidade, unidadeFinal || estoque.unidade_medida);
      const estoqueAtualFormatado = formatarQuantidade(novaQuantidade, estoque.unidade_medida);
      
      return `✅ Estoque atualizado!\n\n📦 ${estoque.produto_nome}\n🔢 Baixado: ${baixadoFormatado}\n📊 Estoque atual: ${estoqueAtualFormatado}`;
    }
    
  } catch (error) {
    console.error('❌ Erro ao processar baixar estoque:', error);
    return "Erro ao processar comando de baixar estoque. Tente novamente.";
  }
}

/**
 * Função para converter unidades e formatar quantidades com 3 casas decimais
 */
function converterUnidade(quantidade: number, unidadeOrigem: string, unidadeDestino: string): number {
  const origemLower = unidadeOrigem?.toLowerCase() || '';
  const destinoLower = unidadeDestino?.toLowerCase() || '';
  
  // Converter de kg para gramas
  if ((origemLower.match(/kg|quilo|quilos/) && destinoLower.includes('g') && !destinoLower.includes('kg'))) {
    return quantidade * 1000;
  }
  
  // Converter de gramas para kg
  if ((origemLower.match(/g|grama|gramas/) && !origemLower.includes('kg')) && destinoLower.includes('kg')) {
    return quantidade / 1000;
  }
  
  // Mesma unidade ou unidades compatíveis
  return quantidade;
}

/**
 * Função para formatar quantidade SEMPRE com 3 casas decimais
 */
function formatarQuantidade(quantidade: number, unidade: string): string {
  const unidadeLower = unidade.toLowerCase();
  
  // Formatar SEMPRE com 3 casas decimais e vírgula brasileira
  const quantidadeFormatada = quantidade.toFixed(3).replace('.', ',');
  
  if (unidadeLower.includes('kg') || unidadeLower.includes('kilo')) {
    return `${quantidadeFormatada} Kg`;
  } else if (unidadeLower.includes('g') && !unidadeLower.includes('kg')) {
    return `${quantidadeFormatada} g`;
  } else if (unidadeLower.includes('l') || unidadeLower.includes('litro')) {
    return `${quantidadeFormatada} L`;
  } else if (unidadeLower.includes('ml')) {
    return `${quantidadeFormatada} ml`;
  } else {
    return `${quantidadeFormatada} ${unidade === 'UN' ? 'Unidades' : unidade}`;
  }
}

/**
 * Processar comando de consultar estoque
 */
async function processarConsultarEstoque(supabase: any, mensagem: any): Promise<string> {
  try {
    console.log('🔍 [INICIO] Processando consulta de estoque...');
    
    // Verificar se usuario_id existe
    if (!mensagem.usuario_id) {
      console.error('❌ [ERRO] Usuario ID não encontrado na mensagem');
      return "❌ Erro interno: usuário não identificado.";
    }
    
    console.log(`📋 [DEBUG] Usuario ID: ${mensagem.usuario_id}`);
    console.log(`📋 [DEBUG] Conteudo original: "${mensagem.conteudo}"`);
    
    // Normalizar texto exatamente como solicitado
    const texto = mensagem.conteudo
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove acentos
      .replace(/[^\w\s]/gi, ""); // remove pontuação
    
    console.log(`📝 [STEP 1] Texto normalizado: "${texto}"`);
    
    if (texto.includes("consulta")) {
      console.log(`✅ [STEP 2] Texto contém "consulta" - prosseguindo...`);
      
      const partes = texto.split("consulta");
      console.log(`📋 [DEBUG] Partes após split: ${JSON.stringify(partes)}`);
      
      const produto = partes[1]?.trim();
      console.log(`📝 [STEP 3] Produto extraído: "${produto}"`);

      if (!produto) {
        console.log(`❌ [STEP 4] Produto vazio - retornando erro`);
        return "❌ Você precisa informar um produto. Exemplo: 'Picotinho, consulta banana'";
      }

      console.log(`🔍 [STEP 5] Iniciando busca no banco...`);
      
    // Buscar no estoque usando nomes normalizados
      const { data: estoques, error } = await supabase
        .from("estoque_app")
        .select("produto_nome, quantidade, unidade_medida")
        .eq("user_id", mensagem.usuario_id);
      
      if (error) {
        console.log(`❌ [STEP 7] Erro no banco:`, error);
        return "❌ Erro ao consultar estoque.";
      }
      
      // Buscar produto comparando nomes normalizados
      const data = estoques?.find((item: any) => {
        const nomeEstoqueNormalizado = normalizarNomeProduto(item.produto_nome);
        return nomeEstoqueNormalizado.includes(produto) || 
               produto.includes(nomeEstoqueNormalizado);
      });

      console.log(`📋 [STEP 6] Resultado do banco:`);
      console.log(`📋 [RESULT] Data:`, data);
      console.log(`📋 [RESULT] Error:`, error);

      if (error || !data) {
        console.log(`❌ [STEP 7] Produto não encontrado - retornando erro`);
        return "❌ Produto não encontrado no seu estoque.";
      }

      console.log(`✅ [STEP 8] Produto encontrado - preparando resposta`);
      const quantidadeFormatada = formatarQuantidade(data.quantidade, data.unidade_medida);
      const produtoNomeLimpo = limparNomeProduto(data.produto_nome);
      const resposta = `✅ Você tem ${quantidadeFormatada} de ${produtoNomeLimpo} em estoque.`;
      console.log(`📤 [STEP 9] Resposta final: "${resposta}"`);
      return resposta;
    }

    console.log(`❌ [FALLBACK] Texto não contém "consulta" - retornando fallback`);
    // Fallback se não for comando válido
    return "❌ Desculpe, não entendi o comando. Tente novamente no formato: 'Picotinho, consulta produto'.";

  } catch (err) {
    console.error("❌ [ERRO GERAL] Erro ao processar comando:", err);
    console.error("❌ [ERRO STACK]:", err.stack);
    return "❌ Houve um erro ao processar sua consulta. Tente novamente mais tarde.";
  }
}

/**
 * Processar comando de aumentar estoque
 */
async function processarAumentarEstoque(supabase: any, mensagem: any): Promise<string> {
  try {
    console.log('📈 Processando comando aumentar estoque...');
    
    // Extrair produto e quantidade do texto com normalização
    const texto = mensagem.conteudo.toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Remove acentos
      .replace(/[^\w\s]/gi, ""); // Remove pontuação
    
    // Remover variações de comando "aumentar" - incluindo TODOS os sinônimos
    const comandosAumentar = /(?:picotinho\s*)?(aumenta|aumentar|soma|somar)\s+/i;
    const textoLimpo = texto.replace(comandosAumentar, '').trim();
    
    // Regex para extrair quantidade e produto (incluindo "k" e "gr")
    const regexQuantidade = /(\d+(?:[.,]\d+)?)\s*(kg|k|kilos?|quilos?|g|gr|gramas?|l|litros?|ml|unidade|un|pacote)?\s*(?:de\s+)?(.+)/i;
    const match = textoLimpo.match(regexQuantidade);
    
    if (!match) {
      return "❌ Não entendi. Para aumentar, use: 'aumentar [quantidade] [produto]'.";
    }
    
    let quantidade = parseFloat(match[1].replace(',', '.'));
    let unidadeExtraida = match[2] ? match[2].toLowerCase() : null;
    const produtoNome = match[3].trim().toUpperCase();
    const produtoNomeNormalizado = produtoNome.toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    
    console.log(`📊 Extraído para aumentar: ${quantidade} ${unidadeExtraida || 'sem unidade'} de ${produtoNome}`);
    
    // Buscar produto no estoque usando nomes normalizados
    const { data: estoques, error: erroEstoque } = await supabase
      .from('estoque_app')
      .select('*')
      .eq('user_id', mensagem.usuario_id);
    
    // Buscar produto comparando nomes normalizados
    const estoque = estoques?.find((item: any) => {
      const nomeEstoqueNormalizado = normalizarNomeProduto(item.produto_nome);
      return nomeEstoqueNormalizado.includes(produtoNomeNormalizado) || 
             produtoNomeNormalizado.includes(nomeEstoqueNormalizado);
    });
    
    if (erroEstoque) {
      console.error('❌ Erro ao buscar estoque:', erroEstoque);
      return "Erro ao consultar estoque. Tente novamente.";
    }
    
    if (!estoque) {
      return `❌ Produto não encontrado no seu estoque. Use o comando 'criar' ou 'incluir' para adicionar um novo produto.`;
    }
    
    // Converter unidades se necessário (CORRIGIDO: kg vs g)
    let quantidadeConvertida = quantidade;
    
    if (unidadeExtraida) {
      // Se foi especificada uma unidade na mensagem
      if (unidadeExtraida.match(/^(g|gr|gramas?)$/)) {
        // Converter gramas para kg (divide por 1000)
        quantidadeConvertida = quantidade / 1000;
        console.log(`🔄 Convertendo ${quantidade} g → ${quantidadeConvertida} kg`);
      } else if (unidadeExtraida.match(/^(kg|k|kilos?|quilos?)$/)) {
        // Manter como kg (sem conversão)
        quantidadeConvertida = quantidade;
        console.log(`✅ Mantendo ${quantidade} kg → ${quantidadeConvertida} kg`);
      } else {
        // Usar a unidade especificada sem conversão
        quantidadeConvertida = quantidade;
      }
    } else {
      // Se não foi especificada unidade, usar valor direto
      quantidadeConvertida = quantidade;
    }
    
    // Somar ao estoque existente e arredondar com 3 casas decimais para precisão de miligrama
    const novaQuantidade = Math.round((estoque.quantidade + quantidadeConvertida) * 1000) / 1000;
    
    // Atualizar estoque com logs completos
    console.log(`🔄 Atualizando estoque ID: ${estoque.id}`);
    console.log(`📊 Quantidade atual: ${estoque.quantidade}`);
    console.log(`➕ Quantidade a adicionar: ${quantidadeConvertida}`);
    console.log(`🎯 Nova quantidade: ${novaQuantidade}`);
    
    const { data: updateResult, error: updateError } = await supabase
      .from('estoque_app')
      .update({
        quantidade: novaQuantidade,
        updated_at: new Date().toISOString()
      })
      .eq('id', estoque.id)
      .select();
    
    if (updateError) {
      console.error('❌ ERRO NA ATUALIZAÇÃO:', updateError);
      return `❌ Erro ao atualizar estoque: ${updateError.message}`;
    }
    
    console.log('✅ ESTOQUE ATUALIZADO COM SUCESSO:', updateResult);
    
    const adicionadoFormatado = formatarQuantidade(quantidade, unidadeExtraida || estoque.unidade_medida);
    const estoqueAtualFormatado = formatarQuantidade(novaQuantidade, estoque.unidade_medida);
    
    const produtoNomeLimpo = limparNomeProduto(estoque.produto_nome);
    return `✅ Foram adicionados ${adicionadoFormatado} ao estoque de ${produtoNomeLimpo}. Agora você tem ${estoqueAtualFormatado} em estoque.`;
    
  } catch (error) {
    console.error('❌ Erro ao processar aumentar estoque:', error);
    return "Erro ao processar comando de aumentar estoque. Tente novamente.";
  }
}

/**
 * Processar comando de adicionar produto
 */
async function processarAdicionarProduto(supabase: any, mensagem: any): Promise<string> {
  try {
    console.log('➕ Processando adicionar produto novo...');
    
    const texto = mensagem.conteudo.toLowerCase();
    
    // Remover comando "adicionar" do início (Picotinho, adiciona | adicionar) 
    const comandosAdicionar = /(?:picotinho,?\s*)?(adiciona|adicionar)\s+/i;
    const textoLimpo = texto.replace(comandosAdicionar, '').trim();
    
    if (!textoLimpo) {
      return "❌ Não entendi. Para adicionar, use: 'adicionar [quantidade] [produto]'.";
    }
    
    // Extrair quantidade se especificada
    const regexQuantidade = /(\d+(?:[.,]\d+)?)\s*(kg|kilos?|quilos?|g|gramas?|l|litros?|ml|unidade|un|pacote)?\s*(?:de\s+)?(.+)/i;
    const match = textoLimpo.match(regexQuantidade);
    
    let quantidade = 1;
    let unidade = 'UN';
    let produtoNome = textoLimpo.toUpperCase();
    
    if (match) {
      quantidade = parseFloat(match[1].replace(',', '.'));
      unidade = match[2] ? match[2].toUpperCase() : 'UN';
      produtoNome = match[3].trim().toUpperCase();
      
      // Normalizar unidades
      if (unidade.match(/G|GRAMAS?/i)) unidade = 'G';
      else if (unidade.match(/KG|KILOS?|QUILOS?/i)) unidade = 'KG';
      else if (unidade.match(/L|LITROS?/i)) unidade = 'L';
      else if (unidade.match(/ML/i)) unidade = 'ML';
      else if (unidade.match(/UNIDADE|UN|PACOTE/i)) unidade = 'UN';
    }
    
    // Limpar completamente qualquer prefixo técnico do nome do produto
    produtoNome = limparNomeProduto(produtoNome);
    
    console.log(`📦 Adicionando produto: ${quantidade} ${unidade} de ${produtoNome}`);
    
    // Verificar se produto já existe
    const { data: existente, error: erroExistente } = await supabase
      .from('estoque_app')
      .select('*')
      .eq('user_id', mensagem.usuario_id)
      .ilike('produto_nome', `%${produtoNome}%`)
      .maybeSingle();
    
    if (erroExistente) {
      console.error('❌ Erro ao verificar produto existente:', erroExistente);
      return "Erro ao verificar estoque. Tente novamente.";
    }
    
    if (existente) {
      const produtoNomeLimpo = limparNomeProduto(existente.produto_nome);
      return `⚠️ O produto ${produtoNomeLimpo} já existe no estoque. Use o comando 'aumentar' para atualizar a quantidade.`;
    }
    
    // Arredondar quantidade baseado na unidade
    if (unidade === 'KG') {
      quantidade = Math.round(quantidade * 100) / 100; // 2 casas decimais
    } else {
      quantidade = Math.round(quantidade); // Número inteiro para outras unidades
    }
    
    // Criar novo produto no estoque
    const { data: novoProduto } = await supabase
      .from('estoque_app')
      .insert({
        user_id: mensagem.usuario_id,
        produto_nome: produtoNome,
        categoria: 'outros',
        quantidade: quantidade,
        unidade_medida: unidade,
        preco_unitario_ultimo: 0
      })
      .select()
      .single();
    
    // Criar sessão para aguardar preço
    await supabase
      .from('whatsapp_sessions')
      .insert({
        usuario_id: mensagem.usuario_id,
        remetente: mensagem.remetente,
        estado: 'aguardando_preco',
        produto_id: novoProduto.id,
        produto_nome: produtoNome,
        contexto: { quantidade, unidade },
        expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString() // 1 hora
      });
    
    const quantidadeFormatada = formatarQuantidade(quantidade, unidade);
    const produtoNomeLimpo = limparNomeProduto(produtoNome);
    
    // Retornar mensagem solicitando o preço de compra
    return `✅ Produto ${produtoNomeLimpo} adicionado com ${quantidadeFormatada} em estoque.\n\nInforme o preço de compra para ${produtoNomeLimpo} (ex: 5,90):`;
    
  } catch (error) {
    console.error('❌ Erro ao adicionar produto:', error);
    return "Erro ao adicionar produto. Tente novamente.";
  }
}

/**
 * Processar resposta de sessão ativa
 */
async function processarRespostaSessao(supabase: any, mensagem: any, sessao: any): Promise<string> {
  try {
    console.log(`🔄 Processando resposta para sessão: ${sessao.estado}`);
    
    if (sessao.estado === 'aguardando_preco') {
      // Processar preço informado
      const precoMatch = mensagem.conteudo.match(/(\d+(?:[.,]\d+)?)/);
      if (!precoMatch) {
        const produtoNomeLimpo = limparNomeProduto(sessao.produto_nome);
        return `❌ Preço inválido. Digite apenas o valor em reais (exemplo: 5,90 ou 5.90).\n\nInforme o preço de compra para ${produtoNomeLimpo}:`;
      }
      
      const preco = parseFloat(precoMatch[1].replace(',', '.'));
      
      // Atualizar produto no estoque com o preço
      await supabase
        .from('estoque_app')
        .update({
          preco_unitario_ultimo: preco,
          updated_at: new Date().toISOString()
        })
        .eq('id', sessao.produto_id);
      
      // Atualizar sessão para aguardar categoria
      await supabase
        .from('whatsapp_sessions')
        .update({
          estado: 'aguardando_categoria',
          contexto: { ...sessao.contexto, preco_informado: preco },
          updated_at: new Date().toISOString()
        })
        .eq('id', sessao.id);
      
      const produtoNomeLimpo = limparNomeProduto(sessao.produto_nome);
      return `💰 Preço R$ ${preco.toFixed(2).replace('.', ',')} registrado para ${produtoNomeLimpo}!\n\nAgora escolha a categoria (digite o número ou o nome):\n\n1️⃣ Hortifruti\n2️⃣ Bebidas\n3️⃣ Padaria\n4️⃣ Mercearia\n5️⃣ Açougue\n6️⃣ Frios\n7️⃣ Limpeza\n8️⃣ Higiene/Farmácia\n9️⃣ Pet\n🔟 Outros`;
      
    } else if (sessao.estado === 'aguardando_categoria') {
      // Processar categoria informada
      const textoLimpo = mensagem.conteudo.trim().toLowerCase();
      
      // Mapeamento de categorias (número e nome)
      const categorias = {
        '1': 'Hortifruti',
        '2': 'Bebidas', 
        '3': 'Padaria',
        '4': 'Mercearia',
        '5': 'Açougue',
        '6': 'Frios',
        '7': 'Limpeza',
        '8': 'Higiene/Farmácia',
        '9': 'Pet',
        '10': 'Outros'
      };
      
      // Mapeamento reverso por nome
      const categoriasPorNome = {
        'hortifruti': 'Hortifruti',
        'bebidas': 'Bebidas',
        'padaria': 'Padaria', 
        'mercearia': 'Mercearia',
        'acougue': 'Açougue',
        'frios': 'Frios',
        'limpeza': 'Limpeza',
        'higiene': 'Higiene/Farmácia',
        'farmacia': 'Higiene/Farmácia',
        'pet': 'Pet',
        'outros': 'Outros'
      };
      
      let categoriaSelecionada: string | null = null;
      
      // Verificar se é número
      if (categorias[textoLimpo]) {
        categoriaSelecionada = categorias[textoLimpo];
      }
      // Verificar se é nome da categoria
      else if (categoriasPorNome[textoLimpo]) {
        categoriaSelecionada = categoriasPorNome[textoLimpo];
      }
      // Verificar correspondências parciais
      else {
        for (const [key, value] of Object.entries(categoriasPorNome)) {
          if (textoLimpo.includes(key) || key.includes(textoLimpo)) {
            categoriaSelecionada = value;
            break;
          }
        }
      }
      
      // Se não foi encontrada categoria válida
      if (!categoriaSelecionada) {
        const produtoNomeLimpo = limparNomeProduto(sessao.produto_nome);
        return `❌ Categoria inválida. Digite o número ou o nome da categoria.\n\nEscolha a categoria para ${produtoNomeLimpo}:\n\n1️⃣ Hortifruti\n2️⃣ Bebidas\n3️⃣ Padaria\n4️⃣ Mercearia\n5️⃣ Açougue\n6️⃣ Frios\n7️⃣ Limpeza\n8️⃣ Higiene/Farmácia\n9️⃣ Pet\n🔟 Outros`;
      }
      
      const precoInformado = sessao.contexto?.preco_informado || 0;
      
      // Atualizar produto no estoque com a categoria
      await supabase
        .from('estoque_app')
        .update({
          categoria: categoriaSelecionada.toLowerCase(),
          updated_at: new Date().toISOString()
        })
        .eq('id', sessao.produto_id);
      
      // Encerrar sessão
      await supabase
        .from('whatsapp_sessions')
        .delete()
        .eq('id', sessao.id);
      
      const produtoNomeLimpo = limparNomeProduto(sessao.produto_nome);
      const quantidadeFormatada = formatarQuantidade(sessao.contexto?.quantidade || 0, sessao.contexto?.unidade || 'unidade');
      
      return `✅ Produto ${produtoNomeLimpo} adicionado com ${quantidadeFormatada}.\n💰 Preço: R$ ${precoInformado.toFixed(2).replace('.', ',')} | 📂 Categoria: ${categoriaSelecionada}`;
    }
    
    return "❌ Estado de sessão inválido.";
    
  } catch (error) {
    console.error('❌ Erro ao processar resposta da sessão:', error);
    return "❌ Erro ao processar sua resposta. Tente novamente.";
  }
}

/**
 * Processar comando de consultar categoria
 */
async function processarConsultarCategoria(supabase: any, mensagem: any): Promise<string> {
  try {
    console.log('📂 [INICIO] Processando consulta de categoria...');
    
    // Verificar se usuario_id existe
    if (!mensagem.usuario_id) {
      console.error('❌ [ERRO] Usuario ID não encontrado na mensagem');
      return "❌ Erro interno: usuário não identificado.";
    }
    
    console.log(`📋 [DEBUG] Usuario ID: ${mensagem.usuario_id}`);
    console.log(`📋 [DEBUG] Conteudo original: "${mensagem.conteudo}"`);
    
    // Normalizar texto
    const texto = mensagem.conteudo
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove acentos
      .replace(/[^\w\s]/gi, ""); // remove pontuação
    
    console.log(`📝 [STEP 1] Texto normalizado: "${texto}"`);
    
    // Extrair nome da categoria da mensagem
    let categoria = '';
    
    // Lista de categorias válidas (baseadas nos dados reais do banco)
    const categoriasValidas = [
      'hortifruti', 'bebidas', 'padaria', 'mercearia', 
      'carnes', 'limpeza', 'higiene', 'farmacia', 
      'higienefarmacia', 'laticinios', 'outros'
    ];
    
    // Buscar categoria na mensagem
    for (const cat of categoriasValidas) {
      if (texto.includes(cat)) {
        categoria = cat;
        break;
      }
    }
    
    // Mapear categorias do texto para formato EXATO do banco (case-sensitive)
    const mapCategoria: { [key: string]: string } = {
      'hortifruti': 'Hortifruti',
      'bebidas': 'Bebidas',
      'padaria': 'Padaria',
      'mercearia': 'Mercearia',
      'carnes': 'Carnes',
      'limpeza': 'Limpeza',
      'higiene': 'Higie./Farm.',
      'farmacia': 'Higie./Farm.',
      'higienefarmacia': 'Higie./Farm.',
      'laticinios': 'Laticínios',
      'outros': 'Outros'
    };
    
    const categoriaFinal = mapCategoria[categoria];
    
    if (!categoriaFinal) {
      console.log(`❌ [STEP 2] Categoria não identificada - retornando ajuda`);
      return "❌ Categoria não identificada. Use: 'categoria [nome]'\n\nCategorias disponíveis:\n🥬 Hortifruti\n🥤 Bebidas\n🍞 Padaria\n🛒 Mercearia\n🥩 Carnes\n🧽 Limpeza\n🧴 Higiene/Farmácia\n🥛 Laticínios\n📦 Outros";
    }
    
    console.log(`📝 [STEP 2] Categoria identificada: "${categoriaFinal}"`);
    console.log(`🔍 [STEP 3] Iniciando busca no banco...`);
    
    // Buscar todos os produtos da categoria
    const { data, error } = await supabase
      .from("estoque_app")
      .select("produto_nome, quantidade, unidade_medida, preco_unitario_ultimo")
      .eq("user_id", mensagem.usuario_id)
      .eq("categoria", categoriaFinal)
      .gt("quantidade", 0) // Apenas produtos com estoque
      .order("produto_nome");
    
    console.log(`📋 [STEP 4] Resultado do banco:`);
    console.log(`📋 [RESULT] Data:`, data);
    console.log(`📋 [RESULT] Error:`, error);
    
    if (error) {
      console.error('❌ [ERRO] Erro ao buscar categoria:', error);
      return "❌ Erro ao consultar estoque da categoria. Tente novamente.";
    }
    
    if (!data || data.length === 0) {
      console.log(`❌ [STEP 5] Nenhum produto encontrado na categoria`);
      return `❌ Nenhum produto encontrado na categoria "${categoriaFinal}".`;
    }
    
    console.log(`✅ [STEP 5] ${data.length} produtos encontrados - preparando resposta`);
    
    // Montar resposta organizada
    let resposta = `📂 **${categoriaFinal.toUpperCase()}** (${data.length} item${data.length > 1 ? 'ns' : ''})\n\n`;
    
    let valorTotal = 0;
    
    data.forEach((produto, index) => {
      const produtoNomeLimpo = limparNomeProduto(produto.produto_nome);
      const quantidadeFormatada = formatarQuantidade(produto.quantidade, produto.unidade_medida);
      
      resposta += `${index + 1}. ${produtoNomeLimpo}\n`;
      resposta += `   📊 ${quantidadeFormatada}`;
      
      if (produto.preco_unitario_ultimo && produto.preco_unitario_ultimo > 0) {
        const precoFormatado = `R$ ${produto.preco_unitario_ultimo.toFixed(2).replace('.', ',')}`;
        const valorItem = produto.quantidade * produto.preco_unitario_ultimo;
        valorTotal += valorItem;
        
        resposta += ` | 💰 ${precoFormatado}/un`;
        resposta += ` | 💵 R$ ${valorItem.toFixed(2).replace('.', ',')}`;
      }
      
      resposta += '\n\n';
    });
    
    // Adicionar valor total se há preços
    if (valorTotal > 0) {
      resposta += `💰 **VALOR TOTAL**: R$ ${valorTotal.toFixed(2).replace('.', ',')}`;
    }
    
    console.log(`📤 [STEP 6] Resposta final preparada`);
    return resposta;
    
  } catch (err) {
    console.error("❌ [ERRO GERAL] Erro ao processar consulta de categoria:", err);
    console.error("❌ [ERRO STACK]:", err.stack);
    return "❌ Houve um erro ao processar sua consulta de categoria. Tente novamente mais tarde.";
  }
}

/**
 * Função para limpar prefixos técnicos do nome do produto
 */
function limparNomeProduto(nome: string): string {
  return nome
    .replace(/^(ID\s+|D\s+|[A-Z]\s+)/i, '') // Remove prefixos como "ID ", "D ", "B ", etc.
    .replace(/^\s*DE\s+/i, '') // Remove "DE " no início
    .replace(/^\s*\w\s+/i, function(match) {
      // Remove qualquer letra isolada seguida de espaço no início
      if (match.trim().length === 1) return '';
      return match;
    })
    .trim();
}

/**
 * Enviar resposta via WhatsApp
 */
async function enviarRespostaWhatsApp(numeroDestino: string, mensagem: string): Promise<boolean> {
  try {
    console.log('📤 [ENVIO] Iniciando envio da resposta WhatsApp...');
    console.log('📤 [ENVIO] Número destino:', numeroDestino);
    console.log('📤 [ENVIO] Mensagem:', mensagem);

    const instanceUrl = Deno.env.get('WHATSAPP_INSTANCE_URL');
    const apiToken = Deno.env.get('WHATSAPP_API_TOKEN');
    const accountSecret = Deno.env.get('WHATSAPP_ACCOUNT_SECRET');
    
    console.log('📤 [ENVIO] Instance URL:', instanceUrl ? 'OK' : 'MISSING');
    console.log('📤 [ENVIO] API Token:', apiToken ? 'OK' : 'MISSING');
    console.log('📤 [ENVIO] Account Secret:', accountSecret ? 'OK' : 'MISSING');

    if (!instanceUrl || !apiToken || !accountSecret) {
      console.error('❌ [ENVIO] Configurações WhatsApp não encontradas');
      return false;
    }

    // USAR A MESMA URL E HEADERS QUE FUNCIONAM PARA A MENSAGEM DE ERRO
    const url = `${instanceUrl}/token/${apiToken}/send-text`;
    
    const payload = {
      phone: numeroDestino,
      message: mensagem
    };

    console.log('📤 [ENVIO] URL completa:', url);
    console.log('📤 [ENVIO] Payload:', JSON.stringify(payload));

    console.log('📤 [ENVIO] Fazendo requisição HTTP...');
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Client-Token': accountSecret
      },
      body: JSON.stringify(payload)
    });

    console.log('📤 [ENVIO] Status da resposta:', response.status);
    console.log('📤 [ENVIO] Headers da resposta:', JSON.stringify(Object.fromEntries(response.headers.entries())));

    const responseBody = await response.text();
    console.log('📤 [ENVIO] Corpo da resposta:', responseBody);

    if (response.ok) {
      console.log('✅ [ENVIO] Resposta enviada via WhatsApp com sucesso');
      return true;
    } else {
      console.error('❌ [ENVIO] Erro ao enviar resposta WhatsApp:', response.status, responseBody);
      return false;
    }

  } catch (error) {
    console.error('❌ [ENVIO] Erro ao enviar resposta WhatsApp:', error);
    return false;
  }
}

serve(handler);