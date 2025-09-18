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
    
    // Verificar se há sessões expiradas e limpá-las
    let sessaoExpirada = false;
    if (sessoesAtivas && sessoesAtivas.length > 0) {
      for (const s of sessoesAtivas) {
        const expira = new Date(s.expires_at);
        if (expira <= agora) {
          console.log(`⏰ [TIMEOUT] Sessão ${s.id} expirada em ${expira.toISOString()} - removendo`);
          await supabase
            .from('whatsapp_sessions')
            .delete()
            .eq('id', s.id);
          sessaoExpirada = true;
        }
      }
    }
    
    // Se houve sessão expirada, enviar mensagem inicial e retornar
    if (sessaoExpirada) {
      console.log(`⏰ [TIMEOUT] Sessão expirou - enviando mensagem inicial`);
      const mensagemInicial = "👋 Olá, eu sou o Picotinho, seu assistente de compras!\nEscolha uma das opções para começar:\n- Consulta [produto]\n- Consulta Categoria [Nome da Categoria]\n- Incluir [produto]\n- Aumentar [quantidade] [produto]\n- Baixar [quantidade] [produto]";
      
      // Enviar resposta e marcar como processada
      const enviado = await enviarRespostaWhatsApp(mensagem.remetente, mensagemInicial);
      await supabase
        .from('whatsapp_mensagens')
        .update({
          processada: true,
          data_processamento: new Date().toISOString(),
          comando_identificado: 'sessao_expirada',
          resposta_enviada: mensagemInicial
        })
        .eq('id', mensagem.id);
      
      console.log(`✅ Timeout processado e mensagem enviada: ${enviado}`);
      return new Response(JSON.stringify({ success: true, message: 'Sessão expirada processada' }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // PRIMEIRO: Limpar sessões expiradas ANTES de verificar se há alguma ativa
    console.log('🧹 [LIMPEZA PREVENTIVA] Removendo sessões expiradas antes da verificação...');
    await supabase
      .from('whatsapp_sessions')
      .delete()
      .eq('usuario_id', mensagem.usuario_id)
      .eq('remetente', mensagem.remetente)
      .lt('expires_at', agora.toISOString());
    console.log('🧹 [LIMPEZA PREVENTIVA] Sessões expiradas removidas');

    // DEPOIS: Buscar apenas sessões realmente ativas
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
            comando_identificado: `sessao_${sessao.estado}`,
            resposta_enviada: resposta
          })
          .eq('id', mensagem.id);
          
        console.log(`✅ Sessão processada e mensagem marcada como processada`);
      } catch (error) {
        console.error(`❌ Erro ao processar sessão:`, error);
        resposta += `❌ Erro ao processar sua resposta. Tente novamente.`;
      }
    } else {
      console.log('📍 [FLUXO] Nenhuma sessão ativa - processando como comando novo');
      
      // Limpeza já foi feita no início da função

      // PRIORIDADE 1: VERIFICAÇÃO ESPECIAL para números/decimais (resposta a sessão perdida)
      const isNumeroOuDecimal = /^\s*\d+([,.]\d+)?\s*$/.test(mensagem.conteudo);
      console.log(`🔍 [DEBUG] Testando número/decimal "${mensagem.conteudo}": ${isNumeroOuDecimal}`);
      console.log(`🔍 [DEBUG] Regex usado: /^\\s*\\d+([,.]+)\\s*$/`);
      console.log(`🔍 [DEBUG] Conteudo trimmed: "${mensagem.conteudo.trim()}"`);
      console.log(`🔍 [DEBUG] Length do conteudo: ${mensagem.conteudo.length}`);
      
      
      // Teste específico para valores como "10,50"
      if (mensagem.conteudo === "10,50") {
        console.log(`🔍 [DEBUG ESPECIAL] Testando especificamente "10,50"`);
        console.log(`🔍 [DEBUG ESPECIAL] Regex match: ${/^\s*\d+([,.]\d+)?\s*$/.test("10,50")}`);
      }
      
      if (isNumeroOuDecimal) {
        console.log(`🔢 [ESPECIAL] Número/decimal detectado: "${mensagem.conteudo}" - verificando sessões não expiradas`);
        
        // Buscar QUALQUER sessão não expirada para este usuário
        console.log(`🔍 [DEBUG SESSAO] Buscando sessão ativa para: usuario_id=${mensagem.usuario_id}, remetente=${mensagem.remetente}`);
        console.log(`🔍 [DEBUG SESSAO] Data atual para comparação: ${new Date().toISOString()}`);
        
        const { data: sessaoAlternativa, error: erroSessaoAlt } = await supabase
          .from('whatsapp_sessions')
          .select('*')
          .eq('usuario_id', mensagem.usuario_id)
          .eq('remetente', mensagem.remetente)
          .gte('expires_at', new Date().toISOString())
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
          
        console.log(`🔍 [DEBUG SESSAO] Erro na busca:`, erroSessaoAlt);
        console.log(`🔍 [DEBUG SESSAO] Sessão encontrada:`, sessaoAlternativa);
          
        if (sessaoAlternativa) {
          console.log(`🔢 [ESPECIAL] Sessão alternativa encontrada: ${sessaoAlternativa.estado} - processando número como resposta`);
          resposta += await processarRespostaSessao(supabase, mensagem, sessaoAlternativa);
          comandoExecutado = true;
          
          // Marcar mensagem como processada IMEDIATAMENTE
          await supabase
            .from('whatsapp_mensagens')
            .update({
              processada: true,
              data_processamento: new Date().toISOString(),
              comando_identificado: `sessao_especial_${sessaoAlternativa.estado}`,
              resposta_enviada: resposta
            })
            .eq('id', mensagem.id);
        }
      }

      // PRIORIDADE 2: Verificar comandos novos (só se não processou número especial)
      if (!comandoExecutado) {
        console.log('🚀 [INICIO VERIFICACAO] Conteudo da mensagem:', mensagem.conteudo);
        
        // Verificar sinais ANTES da normalização para não perder os símbolos
        const temSinalMenos = mensagem.conteudo.trim().startsWith('-');
        const temSinalMais = mensagem.conteudo.trim().startsWith('+');
        console.log('🔍 [DEBUG] Tem sinal menos (startsWith):', temSinalMenos);
        console.log('🔍 [DEBUG] Tem sinal mais (startsWith):', temSinalMais);
        
        const textoNormalizado = mensagem.conteudo.toLowerCase()
          .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Remove acentos
          .replace(/[^\w\s]/gi, ""); // Remove pontuação
        
        console.log('🔍 [DEBUG] Texto normalizado:', textoNormalizado);
        
        // VERIFICAÇÃO DE CANCELAMENTO - ALTA PRIORIDADE (funciona mesmo sem sessão ativa)
        if (textoNormalizado === 'cancela' || textoNormalizado === 'cancelar') {
          console.log('❌ [CANCELAMENTO] Comando cancelar detectado - limpando todas as sessões');
          
          // Limpar todas as sessões do usuário
          await supabase
            .from('whatsapp_sessions')
            .delete()
            .eq('usuario_id', mensagem.usuario_id)
            .eq('remetente', mensagem.remetente);
          
          resposta = "👋 Olá, eu sou o Picotinho, seu assistente de compras!\nEscolha uma das opções para começar:\n- Consulta [produto]\n- Consulta Categoria [Nome da Categoria]\n- Incluir [produto]\n- Aumentar [quantidade] [produto]\n- Baixar [quantidade] [produto]\n- Inserir Nota (envie arquivo da nota fiscal)";
          comandoExecutado = true;
        }
        
        // Comandos para BAIXAR ESTOQUE
        const isBaixar = textoNormalizado.match(/\b(baixa|baixar|retirar|remover)\b/) || temSinalMenos;
        
        console.log('🔍 [DEBUG] isBaixar result:', isBaixar);
        console.log('🔍 [DEBUG] Match regex baixar:', textoNormalizado.match(/\b(baixa|baixar|retirar|remover)\b/));
        console.log('🔍 [DEBUG] temSinalMenos:', temSinalMenos);
        
        // Comandos para AUMENTAR ESTOQUE
        const isAumentar = textoNormalizado.match(/\b(aumenta|aumentar|soma|somar|adiciona|adicionar)\b/) || temSinalMais;
        console.log(`🔍 [DEBUG] Texto normalizado: "${textoNormalizado}"`);
        console.log(`🔍 [DEBUG] isAumentar result:`, isAumentar);
        console.log('🔍 [DEBUG] Match regex aumentar:', textoNormalizado.match(/\b(aumenta|aumentar|soma|somar|adiciona|adicionar)\b/));
        console.log('🔍 [DEBUG] temSinalMais:', temSinalMais);
        
        // Comandos para ADICIONAR PRODUTO NOVO  
        const isAdicionar = textoNormalizado.match(/\b(inclui|incluir|cria|criar|cadastra|cadastrar|adiciona|adicionar)\b/);
        console.log('🔍 [DEBUG] isAdicionar match:', textoNormalizado.match(/\b(inclui|incluir|cria|criar|cadastra|cadastrar|adiciona|adicionar)\b/));
        console.log('🔍 [DEBUG] isAdicionar result:', isAdicionar);
        
        // Comandos para CONSULTAR ESTOQUE
        const isConsultar = textoNormalizado.match(/\b(consulta|consultar)\b/);
        
        // Comandos para CONSULTAR CATEGORIA (requer palavra "categoria" explícita)
        const isConsultarCategoria = textoNormalizado.includes('categoria') && textoNormalizado.match(/\b(consulta|consultar)\b/);
        
        // Verificar se é comando de inserir nota com anexo
        if (mensagem.comando_identificado === 'inserir_nota') {
          console.log('📎 Comando INSERIR NOTA identificado com anexo');
          resposta += await processarInserirNota(supabase, mensagem);
          comandoExecutado = true;
        } else if (mensagem.comando_identificado === 'solicitar_nota') {
          console.log('📋 Comando SOLICITAR NOTA identificado (texto apenas)');
          resposta += "📂 Para inserir uma nota fiscal, envie o arquivo (PDF, XML ou imagem) anexado na mensagem.\n\nTipos aceitos:\n• PDF da nota fiscal\n• XML da nota fiscal\n• Foto/imagem da nota fiscal\n\nApenas envie o arquivo que eu processarei automaticamente!";
          comandoExecutado = true;
        } else if (isBaixar) {
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
          console.log('❌ [FALLBACK] Comando não reconhecido:', textoNormalizado);
          console.log('❌ [FALLBACK] temSinalMenos:', temSinalMenos);
          console.log('❌ [FALLBACK] isBaixar:', isBaixar);
          console.log('❌ [FALLBACK] isAumentar:', isAumentar);
          console.log('❌ [FALLBACK] isAdicionar:', isAdicionar);
          console.log('❌ [FALLBACK] isConsultar:', isConsultar);
          // Limpar qualquer sessão ativa antes de enviar mensagem inicial
          await supabase
            .from('whatsapp_sessions')
            .delete()
            .eq('usuario_id', mensagem.usuario_id)
            .eq('remetente', mensagem.remetente);
          
          console.log(`🗑️ [RESET] Sessões ativas removidas para ${mensagem.remetente}`);
          
          resposta = "👋 Olá, eu sou o Picotinho, seu assistente de compras!\nEscolha uma das opções para começar:\n- Consulta [produto]\n- Consulta Categoria [Nome da Categoria]\n- Incluir [produto]\n- Aumentar [quantidade] [produto]\n- Baixar [quantidade] [produto]\n- Inserir Nota (envie arquivo da nota fiscal)";
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

// ⚠️ FUNÇÃO REMOVIDA - Normalização agora é EXCLUSIVA da IA-2
// A normalização de produtos não deve mais ser feita aqui para evitar inconsistências
// Para comandos WhatsApp, usar comparação por similaridade simples

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
    
    // Extrair produto e quantidade do texto (sem normalização)
    const texto = mensagem.conteudo.toLowerCase().trim();
    
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
    const produtoNomeSimples = produtoNomeOriginal.toLowerCase().trim();
    
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
    
    // Buscar produto comparando nomes (similaridade simples)
    const estoque = estoques?.find((item: any) => {
      const nomeEstoqueSimples = item.produto_nome.toLowerCase().trim();
      return nomeEstoqueSimples.includes(produtoNomeSimples) || 
             produtoNomeSimples.includes(nomeEstoqueSimples);
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
      
      // Buscar produto comparando nomes (similaridade simples)
      const data = estoques?.find((item: any) => {
        const nomeEstoqueSimples = item.produto_nome.toLowerCase().trim();
        const produtoSimples = produto.toLowerCase().trim();
        return nomeEstoqueSimples.includes(produtoSimples) || 
               produtoSimples.includes(nomeEstoqueSimples);
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
    
    // Limpar qualquer sessão ativa antes de retornar mensagem inicial
    await supabase
      .from('whatsapp_sessions')
      .delete()
      .eq('usuario_id', usuarioId)
      .eq('remetente', remetente);
    
    console.log(`🗑️ [RESET] Sessões ativas removidas para consulta fallback`);
    
    // Fallback se não for comando válido
    return "👋 Olá, eu sou o Picotinho, seu assistente de compras!\nEscolha uma das opções para começar:\n- Consulta [produto]\n- Consulta Categoria [Nome da Categoria]\n- Incluir [produto]\n- Aumentar [quantidade] [produto]\n- Baixar [quantidade] [produto]";

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
    
    // Buscar produto comparando nomes (similaridade simples)
    const estoque = estoques?.find((item: any) => {
      const nomeEstoqueSimples = item.produto_nome.toLowerCase().trim();
      const produtoSimples = produtoNomeNormalizado.toLowerCase().trim();
      return nomeEstoqueSimples.includes(produtoSimples) || 
             produtoSimples.includes(nomeEstoqueSimples);
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

// Função para normalizar preços (vírgula/ponto para formato padrão)
function normalizarPreco(input: string): number | null {
  if (!input) {
    console.log(`💰 [DEBUG] normalizarPreco: input vazio`);
    return null;
  }

  console.log(`💰 [DEBUG] normalizarPreco: input original = "${input}"`);

  // Remove espaços extras
  let valor = input.trim();
  console.log(`💰 [DEBUG] normalizarPreco: após trim = "${valor}"`);

  // Troca vírgula por ponto (para 45,90 → 45.90)
  valor = valor.replace(',', '.');
  console.log(`💰 [DEBUG] normalizarPreco: após replace vírgula = "${valor}"`);

  // Remove qualquer caractere inválido
  valor = valor.replace(/[^0-9.]/g, '');
  console.log(`💰 [DEBUG] normalizarPreco: após limpar caracteres = "${valor}"`);

  // Converte para número
  const num = parseFloat(valor);
  console.log(`💰 [DEBUG] normalizarPreco: parseFloat = ${num}`);

  if (isNaN(num)) {
    console.log(`💰 [DEBUG] normalizarPreco: NaN detectado, retornando null`);
    return null;
  }

  // Retorna sempre com 2 casas decimais
  const resultado = Math.round(num * 100) / 100;
  console.log(`💰 [DEBUG] normalizarPreco: resultado final = ${resultado}`);
  return resultado;
}

// Função para formatar preço para exibição (R$ X,XX)
function formatarPreco(valor: number): string {
  return `R$ ${valor.toFixed(2).replace('.', ',')}`;
}

// Função para encerrar sessão por excesso de erros
async function encerrarSessaoPorErros(supabase: any, sessaoId: string): Promise<string> {
  // Deletar a sessão
  await supabase
    .from('whatsapp_sessions')
    .delete()
    .eq('id', sessaoId);
  
  return "👋 Olá, eu sou o Picotinho! Você pode consultar, incluir ou atualizar produtos do estoque.\nExemplos: 'consulta arroz', 'incluir leite 1L', 'aumentar 2kg de batata'.";
}

/**
 * Processar comando de adicionar produto
 */
async function processarAdicionarProduto(supabase: any, mensagem: any): Promise<string> {
  try {
    console.log('➕ Processando adicionar produto novo...');
    
    const texto = mensagem.conteudo.toLowerCase();
    
    // Remover comandos variados do início - captura TUDO que vem depois das palavras-chave
    const comandosAdicionar = /(?:picotinho,?\s*)?(inclui|incluir|cria|criar|cadastra|cadastrar|adiciona|adicionar)\s+/i;
    const textoLimpo = texto.replace(comandosAdicionar, '').trim();
    
    if (!textoLimpo) {
      return "❌ Não entendi. Para incluir um produto, use: 'Incluir café pilão 500g'.";
    }
    
    // Extrair nome do produto (sem quantidade para este fluxo)
    let produtoNome = textoLimpo.toUpperCase();
    
    // Limpar completamente qualquer prefixo técnico do nome do produto
    produtoNome = limparNomeProduto(produtoNome);
    
    console.log(`📦 Iniciando cadastro do produto: ${produtoNome}`);
    
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
    
    // Criar sessão para fluxo multi-step
    await supabase
      .from('whatsapp_sessions')
      .insert({
        usuario_id: mensagem.usuario_id,
        remetente: mensagem.remetente,
        estado: 'aguardando_unidade',
        produto_nome: produtoNome,
        contexto: { tentativas_erro: 0 },
        expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString() // 5 minutos
      });
    
    const produtoNomeLimpo = limparNomeProduto(produtoNome);
    
    // Primeira pergunta: unidade
    return `Qual a unidade do produto ${produtoNomeLimpo}?
1️⃣ Quilo
2️⃣ Unidade  
3️⃣ Litro`;
    
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
    
    // VERIFICAÇÃO DE CANCELAMENTO - SEMPRE PRIMEIRA PRIORIDADE
    const conteudoLimpo = mensagem.conteudo.trim().toUpperCase();
    if (conteudoLimpo === 'CANCELA' || conteudoLimpo === 'CANCELAR') {
      console.log('❌ [CANCELAMENTO] Usuário solicitou cancelamento da sessão');
      
      // Deletar sessão imediatamente
      await supabase
        .from('whatsapp_sessions')
        .delete()
        .eq('id', sessao.id);
      
      // Retornar mensagem inicial padrão
      return "👋 Olá, eu sou o Picotinho, seu assistente de compras!\nEscolha uma das opções para começar:\n- Consulta [produto]\n- Consulta Categoria [Nome da Categoria]\n- Incluir [produto]\n- Aumentar [quantidade] [produto]\n- Baixar [quantidade] [produto]";
    }
    
    const tentativasErro = sessao.contexto?.tentativas_erro || 0;
    const produtoNomeLimpo = limparNomeProduto(sessao.produto_nome);
    
    // ETAPA 1: Aguardando unidade
    if (sessao.estado === 'aguardando_unidade') {
      const resposta = mensagem.conteudo.trim().toLowerCase();
      let unidadeSelecionada = null;
      
      // Mapear resposta para unidade
      if (resposta === '1' || resposta.includes('quilo') || resposta.includes('kg')) {
        unidadeSelecionada = 'kg';
      } else if (resposta === '2' || resposta.includes('unidade') || resposta.includes('un')) {
        unidadeSelecionada = 'un';
      } else if (resposta === '3' || resposta.includes('litro') || resposta.includes('l')) {
        unidadeSelecionada = 'l';
      }
      
      if (!unidadeSelecionada) {
        const novasTentativas = tentativasErro + 1;
        
        if (novasTentativas >= 4) {
          // Na quarta tentativa, encerrar sessão e enviar mensagem inicial
          await supabase
            .from('whatsapp_sessions')
            .delete()
            .eq('id', sessao.id);
          
          return "👋 Olá, eu sou o Picotinho, seu assistente de compras!\nEscolha uma das opções para começar:\n- Consulta [produto]\n- Consulta Categoria [Nome da Categoria]\n- Incluir [produto]\n- Aumentar [quantidade] [produto]\n- Baixar [quantidade] [produto]";
        }
        
        // Para 1ª, 2ª ou 3ª tentativa, enviar mensagem de erro normal
        await supabase
          .from('whatsapp_sessions')
          .update({
            contexto: { ...sessao.contexto, tentativas_erro: novasTentativas },
            updated_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString() // Renovar timeout
          })
          .eq('id', sessao.id);
        
        return `❌ Não entendi. Escolha uma das opções: 1- Kg, 2- Unidade ou 3- Litro.`;
      }
      
      // Avançar para próxima etapa
      await supabase
        .from('whatsapp_sessions')
        .update({
          estado: 'aguardando_quantidade',
          contexto: { ...sessao.contexto, unidade: unidadeSelecionada, tentativas_erro: 0 },
          updated_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString() // Renovar timeout para 5 minutos
        })
        .eq('id', sessao.id);
      
      return `Qual a quantidade do produto ${produtoNomeLimpo}?`;
    }
    
    // ETAPA 2: Aguardando quantidade
    else if (sessao.estado === 'aguardando_quantidade') {
      const quantidadeNormalizada = normalizarPreco(mensagem.conteudo);
      
      if (quantidadeNormalizada === null || quantidadeNormalizada <= 0) {
        const novasTentativas = tentativasErro + 1;
        
        if (novasTentativas >= 4) {
          // Na quarta tentativa, encerrar sessão e enviar mensagem inicial
          await supabase
            .from('whatsapp_sessions')
            .delete()
            .eq('id', sessao.id);
          
          return "👋 Olá, eu sou o Picotinho, seu assistente de compras!\nEscolha uma das opções para começar:\n- Consulta [produto]\n- Consulta Categoria [Nome da Categoria]\n- Incluir [produto]\n- Aumentar [quantidade] [produto]\n- Baixar [quantidade] [produto]";
        }
        
        // Para 1ª, 2ª ou 3ª tentativa, enviar mensagem de erro normal
        await supabase
          .from('whatsapp_sessions')
          .update({
            contexto: { ...sessao.contexto, tentativas_erro: novasTentativas },
            updated_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString() // Renovar timeout
          })
          .eq('id', sessao.id);
        
        return `❌ Não entendi. Por favor, informe a quantidade no formato:
- Exemplo para Kg: 1.250 (1 quilo e 250 gramas)
- Exemplo para Unidade: 3
- Exemplo para Litro: 0.750 (750 ml)`;
      }
      
      const quantidade = quantidadeNormalizada;
      
      // Avançar para próxima etapa
      await supabase
        .from('whatsapp_sessions')
        .update({
          estado: 'aguardando_categoria',
          contexto: { ...sessao.contexto, quantidade, tentativas_erro: 0 },
          updated_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString() // Renovar timeout para 5 minutos
        })
        .eq('id', sessao.id);
      
      return `Escolha uma categoria para o produto:
1. Hortifruti
2. Bebidas
3. Mercearia
4. Açougue
5. Padaria
6. Laticínios/Frios
7. Limpeza
8. Higiene/Farmácia
9. Congelados
10. Pet
11. Outros`;
    }
    
    // ETAPA 3: Aguardando categoria
    else if (sessao.estado === 'aguardando_categoria') {
      const resposta = mensagem.conteudo.trim();
      let categoriaSelecionada = null;
      
      // Mapear apenas números de 1 a 11
      const mapeamentoCategoria = {
        '1': 'hortifruti',
        '2': 'bebidas',
        '3': 'mercearia',
        '4': 'açougue',
        '5': 'padaria',
        '6': 'laticínios',
        '7': 'limpeza',
        '8': 'higiene',
        '9': 'congelados',
        '10': 'pet',
        '11': 'outros'
      };
      
      categoriaSelecionada = mapeamentoCategoria[resposta];
      
      if (!categoriaSelecionada) {
        const novasTentativas = tentativasErro + 1;
        
        if (novasTentativas >= 4) {
          // Na quarta tentativa, encerrar sessão e enviar mensagem inicial
          await supabase
            .from('whatsapp_sessions')
            .delete()
            .eq('id', sessao.id);
          
          return "👋 Olá, eu sou o Picotinho, seu assistente de compras!\nEscolha uma das opções para começar:\n- Consulta [produto]\n- Consulta Categoria [Nome da Categoria]\n- Incluir [produto]\n- Aumentar [quantidade] [produto]\n- Baixar [quantidade] [produto]";
        }
        
        // Para 1ª, 2ª ou 3ª tentativa, enviar mensagem de erro normal
        await supabase
          .from('whatsapp_sessions')
          .update({
            contexto: { ...sessao.contexto, tentativas_erro: novasTentativas },
            updated_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString() // Renovar timeout
          })
          .eq('id', sessao.id);
        
        return `❌ Não entendi. Por favor, informe apenas o número da categoria (1 a 11).`;
      }
      
      // Avançar para próxima etapa
      await supabase
        .from('whatsapp_sessions')
        .update({
          estado: 'aguardando_preco',
          contexto: { ...sessao.contexto, categoria: categoriaSelecionada, tentativas_erro: 0 },
          updated_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString() // Renovar timeout para 5 minutos
        })
        .eq('id', sessao.id);
      
      return `Qual o preço de compra do produto ${produtoNomeLimpo}? (Informe apenas o valor, ex.: 8,90)`;
    }
    
    // ETAPA 4: Aguardando preço
    else if (sessao.estado === 'aguardando_preco') {
      console.log(`💰 [SESSAO] Processando estado aguardando_preco`);
      console.log(`💰 [SESSAO] Mensagem original recebida: "${mensagem.conteudo}"`);
      
      // Limpar e normalizar o valor do preço dentro da sessão
      let valorLimpo = mensagem.conteudo.trim();
      console.log(`💰 [SESSAO] Após trim: "${valorLimpo}"`);
      
      // Substituir vírgula por ponto
      valorLimpo = valorLimpo.replace(',', '.');
      console.log(`💰 [SESSAO] Após substituir vírgula por ponto: "${valorLimpo}"`);
      
      // Remover caracteres inválidos (manter apenas números e ponto)
      valorLimpo = valorLimpo.replace(/[^0-9.]/g, '');
      console.log(`💰 [SESSAO] Após limpar caracteres inválidos: "${valorLimpo}"`);
      
      // Converter para número
      const precoNumerico = parseFloat(valorLimpo);
      console.log(`💰 [SESSAO] Valor numérico parseFloat: ${precoNumerico}`);
      
      // Validar se é um número válido e maior que zero
      if (isNaN(precoNumerico) || precoNumerico <= 0) {
        console.log(`💰 [SESSAO] Valor inválido detectado: ${precoNumerico}`);
        const novasTentativas = tentativasErro + 1;
        
        if (novasTentativas >= 4) {
          // Na quarta tentativa, encerrar sessão e enviar mensagem inicial
          await supabase
            .from('whatsapp_sessions')
            .delete()
            .eq('id', sessao.id);
          
          return "👋 Olá, eu sou o Picotinho, seu assistente de compras!\nEscolha uma das opções para começar:\n- Consulta [produto]\n- Consulta Categoria [Nome da Categoria]\n- Incluir [produto]\n- Aumentar [quantidade] [produto]\n- Baixar [quantidade] [produto]";
        }
        
        // Para 1ª, 2ª ou 3ª tentativa, enviar mensagem de erro normal
        await supabase
          .from('whatsapp_sessions')
          .update({
            contexto: { ...sessao.contexto, tentativas_erro: novasTentativas },
            updated_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString() // Renovar timeout
          })
          .eq('id', sessao.id);
        
        return `❌ Não entendi, tente novamente. Escolha uma das opções listadas.

Qual o preço de compra do produto ${produtoNomeLimpo}? (Informe apenas o valor, ex.: 8,90)`;
      }
      
      // Garantir 2 casas decimais
      const precoFinal = Math.round(precoNumerico * 100) / 100;
      console.log(`💰 [SESSAO] Valor numérico final antes de salvar: ${precoFinal}`);
      
      const preco = precoFinal;
      const { unidade, quantidade, categoria } = sessao.contexto;
      
      // Converter quantidade com 3 casas decimais
      const quantidadeDecimal = Math.round(quantidade * 1000) / 1000;
      
      // Criar produto no estoque
      await supabase
        .from('estoque_app')
        .insert({
          user_id: mensagem.usuario_id,
          produto_nome: sessao.produto_nome,
          categoria: categoria,
          quantidade: quantidadeDecimal,
          unidade_medida: unidade.toUpperCase(),
          preco_unitario_ultimo: preco,
          origem: 'manual' // IMPORTANTE: Marcar como produto inserido manualmente via WhatsApp
        });
      
      // Encerrar sessão
      await supabase.from('whatsapp_sessions').delete().eq('id', sessao.id);
      
      // Formatar resposta final
      const quantidadeFormatada = formatarQuantidade(quantidadeDecimal, unidade);
      const precoFormatado = formatarPreco(preco);
      const categoriaDisplay = categoria.charAt(0).toUpperCase() + categoria.slice(1);
      
      return `✅ Produto ${produtoNomeLimpo} adicionado com sucesso!
📦 Quantidade: ${quantidadeFormatada}
📂 Categoria: ${categoriaDisplay}
💰 Preço: ${precoFormatado}`;
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

/**
 * Processar comando de inserir nota fiscal via WhatsApp
 */
async function processarInserirNota(supabase: any, mensagem: any): Promise<string> {
  try {
    console.log('📎 Processando inserção de nota fiscal via WhatsApp...');
    
    if (!mensagem.anexo_info) {
      return "❌ Nenhum arquivo foi detectado. Por favor, envie o arquivo da nota fiscal (PDF, XML ou imagem) anexado à mensagem.";
    }
    
    const anexo = mensagem.anexo_info;
    console.log('📎 Anexo detectado:', anexo);
    
    // Verificar tipo de arquivo aceito
    const tiposAceitos = [
      'application/pdf',
      'application/xml', 
      'text/xml',
      'image/jpeg',
      'image/jpg', 
      'image/png',
      'image/webp'
    ];
    
    // Obter mimetype do anexo ou da mensagem original
    let mimetype = anexo.mimetype;
    if (!mimetype && mensagem.webhook_data?.document?.mimeType) {
      mimetype = mensagem.webhook_data.document.mimeType;
    }
    if (!mimetype && mensagem.webhook_data?.image?.mimetype) {
      mimetype = mensagem.webhook_data.image.mimetype;
    }
    
    if (!tiposAceitos.includes(mimetype)) {
      return `❌ Tipo de arquivo não aceito: ${mimetype || 'undefined'}\n\nTipos aceitos:\n• PDF (.pdf)\n• XML (.xml)\n• Imagens (.jpg, .png, .webp)`;
    }
    
    // Obter URL do anexo
    let anexoUrl = anexo.url;
    if (!anexoUrl && mensagem.webhook_data?.document?.documentUrl) {
      anexoUrl = mensagem.webhook_data.document.documentUrl;
    }
    if (!anexoUrl && mensagem.webhook_data?.image?.url) {
      anexoUrl = mensagem.webhook_data.image.url;
    }
    
    // Baixar o arquivo do WhatsApp
    console.log('📥 Baixando arquivo do WhatsApp:', anexoUrl);
    
    const response = await fetch(anexoUrl);
    if (!response.ok) {
      console.error('❌ Erro ao baixar arquivo:', response.status, response.statusText);
      return "❌ Erro ao baixar o arquivo. Tente enviar novamente.";
    }
    
    const fileBuffer = await response.arrayBuffer();
    const fileData = new Uint8Array(fileBuffer);
    
    console.log('✅ Arquivo baixado com sucesso, tamanho:', fileData.length, 'bytes');
    
    // Determinar nome do arquivo e tipo
    let fileName = anexo.filename || mensagem.webhook_data?.document?.fileName || mensagem.webhook_data?.image?.filename || 'nota_whatsapp';
    if (anexo.tipo === 'document' && mimetype === 'application/pdf') {
      fileName = fileName.endsWith('.pdf') ? fileName : fileName + '.pdf';
    } else if (anexo.tipo === 'document' && mimetype && mimetype.includes('xml')) {
      fileName = fileName.endsWith('.xml') ? fileName : fileName + '.xml';
    } else if (anexo.tipo === 'image') {
      const ext = mimetype === 'image/jpeg' ? '.jpg' : 
                  mimetype === 'image/png' ? '.png' : 
                  mimetype === 'image/webp' ? '.webp' : '.jpg';
      fileName = fileName.includes('.') ? fileName : fileName + ext;
    }
    
    // Upload para o Supabase Storage
    const filePath = `${mensagem.usuario_id}/whatsapp_${Date.now()}_${fileName}`;
    
    console.log('📤 Fazendo upload para storage:', filePath);
    
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('receipts')
      .upload(filePath, fileData, {
        contentType: anexo.mimetype,
        upsert: false
      });
    
    if (uploadError) {
      console.error('❌ Erro no upload:', uploadError);
      return "❌ Erro ao salvar o arquivo. Tente novamente.";
    }
    
    console.log('✅ Upload realizado com sucesso:', uploadData);
    
    // Obter URL pública
    const { data: { publicUrl } } = supabase.storage
      .from('receipts')
      .getPublicUrl(filePath);
    
    console.log('🔗 URL pública gerada:', publicUrl);
    
    // Criar registro na tabela notas_imagens
    const { data: notaImagem, error: dbError } = await supabase
      .from('notas_imagens')
      .insert({
        usuario_id: mensagem.usuario_id,
        imagem_url: publicUrl,
        imagem_path: filePath,
        processada: false,
        origem: 'whatsapp',
        dados_extraidos: {
          origem_whatsapp: true,
          remetente: mensagem.remetente,
          timestamp: new Date().toISOString(),
          arquivo_original: fileName,
          mimetype: anexo.mimetype
        }
      })
      .select()
      .single();
    
    if (dbError) {
      console.error('❌ Erro ao salvar no banco:', dbError);
      return "❌ Erro ao processar a nota. Tente novamente.";
    }
    
    console.log('✅ Nota salva no banco:', notaImagem.id);
    
    // Iniciar processamento assíncrono seguindo o mesmo fluxo do app
    console.log('🤖 Iniciando processamento da nota...');
    
    // Fase 1: Validação (IA-1)
    const validacaoResponse = await supabase.functions.invoke('validate-receipt', {
      body: {
        notaImagemId: notaImagem.id,
        imageUrl: anexo.tipo === 'image' ? publicUrl : null,
        pdfUrl: anexo.tipo === 'document' ? publicUrl : null,
        userId: mensagem.usuario_id
      }
    });
    
    if (validacaoResponse.error) {
      console.error('❌ Erro na validação:', validacaoResponse.error);
      return "❌ Erro na validação da nota. Tente novamente.";
    }
    
    const validacao = validacaoResponse.data;
    console.log('✅ Validação concluída:', validacao);
    
    if (!validacao.approved) {
      console.log('❌ Nota rejeitada na validação:', validacao.reason);
      return `❌ ${validacao.message}`;
    }
    
    // Processar em background usando EdgeRuntime.waitUntil para garantir execução
    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
      EdgeRuntime.waitUntil(
        processarNotaEmBackground(supabase, anexo, mimetype, publicUrl, notaImagem, mensagem)
      );
    } else {
      // Fallback para ambientes sem EdgeRuntime
      processarNotaEmBackground(supabase, anexo, mimetype, publicUrl, notaImagem, mensagem)
        .catch(error => console.error('❌ Erro no processamento em background:', error));
    }
    
    return "📂 Nota recebida, iniciando avaliação...";
    
  } catch (error: any) {
    console.error('❌ Erro geral ao processar nota:', error);
    return "❌ Erro interno ao processar a nota. Tente novamente.";
  }
}

/**
 * Processa nota fiscal em background enviando mensagem final após conclusão
 */
async function processarNotaEmBackground(
  supabase: any, 
  anexo: any, 
  mimetype: string, 
  publicUrl: string, 
  notaImagem: any, 
  mensagem: any
) {
  console.log('🔄 Iniciando processamento em background...');
  
  try {
    if (anexo.tipo === 'document' && mimetype === 'application/pdf') {
      console.log('📄 Processando PDF...');
      
      // Etapa 1: Extração de dados do PDF
      const extractResult = await supabase.functions.invoke('process-danfe-pdf', {
        body: { 
          pdfUrl: publicUrl,
          notaImagemId: notaImagem.id,
          userId: mensagem.usuario_id
        }
      });
      
      console.log('✅ Extração de dados concluída:', extractResult);
      
      if (extractResult.error) {
        throw new Error(`Erro na extração: ${extractResult.error.message}`);
      }
      
      // Etapa 2: Processamento completo com IA-2
      console.log('🤖 Iniciando processamento completo com IA-2...');
      const processResult = await supabase.functions.invoke('process-receipt-full', {
        body: { imagemId: notaImagem.id }
      });
      
      console.log('✅ Processamento completo concluído:', processResult);
      
      if (processResult.error) {
        throw new Error(`Erro no processamento: ${processResult.error.message}`);
      }
      
    } else {
      console.log('🖼️ Processando imagem...');
      
      // Para imagens, processar diretamente
      const processResult = await supabase.functions.invoke('process-receipt-full', {
        body: { imagemId: notaImagem.id }
      });
      
      console.log('✅ Processamento de imagem concluído:', processResult);
      
      if (processResult.error) {
        throw new Error(`Erro no processamento: ${processResult.error.message}`);
      }
    }
    
    // Aguardar um pouco para garantir que tudo foi persistido
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Enviar mensagem de sucesso final
    console.log('📱 Enviando mensagem de confirmação final...');
    await enviarRespostaWhatsApp(
      mensagem.remetente, 
      "✅ Nota processada com sucesso! Os produtos foram adicionados ao seu estoque."
    );
    
    console.log('🎉 Processamento completo e confirmação enviada!');
    
  } catch (error) {
    console.error('❌ Erro no processamento em background:', error);
    
    // Mensagem de erro mais específica baseada no tipo de falha
    let mensagemErro = "❌ Erro ao processar a nota fiscal.";
    
    const errorStr = String(error).toLowerCase();
    if (errorStr.includes('estoque') || errorStr.includes('inserção') || errorStr.includes('insert')) {
      mensagemErro = "❌ Erro ao salvar produtos no estoque. A nota foi lida corretamente, mas houve falha na gravação dos itens.\n\nTente novamente em alguns instantes.";
    } else if (errorStr.includes('ia-2') || errorStr.includes('normalizar') || errorStr.includes('indisponível')) {
      mensagemErro = "❌ Aguardando disponibilidade da IA para processar a nota fiscal.\n\nTente novamente em alguns instantes.";
    } else if (errorStr.includes('legível') || errorStr.includes('arquivo')) {
      mensagemErro = "❌ Erro ao processar a nota fiscal. Verifique se o arquivo está legível e tente novamente.";
    } else {
      mensagemErro = "❌ Erro inesperado ao processar a nota fiscal.\n\nTente novamente em alguns instantes.";
    }
    
    // Enviar mensagem de erro específica
    await enviarRespostaWhatsApp(mensagem.remetente, mensagemErro);
  }
}

serve(handler);