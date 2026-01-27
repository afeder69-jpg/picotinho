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
      const mensagemInicial = "👋 Olá, eu sou o Picotinho, seu assistente de compras!\nEscolha uma das opções para começar:\n- Estoque (ver todo o estoque)\n- Consulta [produto]\n- Consulta Categoria [Nome da Categoria]\n- Incluir [produto]\n- Aumentar [quantidade] [produto]\n- Baixar [quantidade] [produto]\n- Inserir Nota (envie arquivo da nota fiscal)";
      
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
          
          resposta = "👋 Olá, eu sou o Picotinho, seu assistente de compras!\nEscolha uma das opções para começar:\n- Estoque (ver todo o estoque)\n- Consulta [produto]\n- Consulta Categoria [Nome da Categoria]\n- Incluir [produto]\n- Aumentar [quantidade] [produto]\n- Baixar [quantidade] [produto]\n- Inserir Nota (envie arquivo da nota fiscal)";
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
        
        // Comandos para CONSULTAR ESTOQUE (aceita "consulta", "consultar" ou "estoque")
        // Verificar se é comando de ESTOQUE (sozinho ou com consulta)
        const isEstoque = textoNormalizado === 'estoque' || 
                          textoNormalizado === 'consulta estoque' ||
                          textoNormalizado === 'consultar estoque';
        
        // Verificar se é CONSULTA de produto específico
        const isConsultar = textoNormalizado.match(/\b(consulta|consultar)\b/) && !isEstoque;
        
        console.log('🔍 [DEBUG] isEstoque:', isEstoque);
        console.log('🔍 [DEBUG] isConsultar:', isConsultar);
        
        // Comandos para CONSULTAR CATEGORIA (requer palavra "categoria" explícita)
        const isConsultarCategoria = textoNormalizado.includes('categoria') && textoNormalizado.match(/\b(consulta|consultar)\b/);
        
        // PRIORIDADE: Verificar se webhook já identificou o comando
        if (mensagem.comando_identificado === 'processar_audio') {
          console.log('🎤 Comando ÁUDIO identificado - processando voz...');
          resposta += await processarAudio(supabase, mensagem);
          comandoExecutado = true;
        } else if (mensagem.comando_identificado === 'consultar_categoria') {
          console.log('📂 Comando CONSULTAR CATEGORIA identificado pelo webhook:', mensagem.conteudo);
          resposta += await processarConsultarCategoria(supabase, mensagem);
          comandoExecutado = true;
        } else if (mensagem.comando_identificado === 'inserir_nota') {
          console.log('📎 Comando INSERIR NOTA identificado com anexo');
          resposta += await processarInserirNota(supabase, mensagem);
          comandoExecutado = true;
        } else if (mensagem.comando_identificado === 'solicitar_nota') {
          console.log('📋 Comando SOLICITAR NOTA identificado (texto apenas)');
          resposta += "📂 Para inserir uma nota fiscal, envie o arquivo (PDF, XML ou imagem) anexado na mensagem.\n\nTipos aceitos:\n• PDF da nota fiscal\n• XML da nota fiscal\n• Foto/imagem da nota fiscal\n\nApenas envie o arquivo que eu processarei automaticamente!";
          comandoExecutado = true;
        } else if (mensagem.comando_identificado === 'solicitar_lista') {
          console.log('📋 Comando SOLICITAR LISTA identificado');
          resposta += await processarSolicitarLista(supabase, mensagem);
          comandoExecutado = true;
        } else if (isBaixar) {
          console.log('📉 Comando BAIXAR identificado:', temSinalMenos ? 'simbolo menos' : textoNormalizado);
          resposta += await processarComandoInteligente(supabase, mensagem, 'baixar');
          comandoExecutado = true;
        } else if (isAumentar) {
          console.log('📈 Comando AUMENTAR identificado:', textoNormalizado);
          resposta += await processarComandoInteligente(supabase, mensagem, 'aumentar');
          comandoExecutado = true;
        } else if (isAdicionar) {
          console.log('➕ Comando ADICIONAR identificado:', textoNormalizado);
          resposta += await processarAdicionarProduto(supabase, mensagem);
          comandoExecutado = true;
        } else if (isEstoque) {
          console.log('📦 Comando ESTOQUE COMPLETO identificado:', textoNormalizado);
          resposta += await processarConsultarEstoque(supabase, mensagem);
          comandoExecutado = true;
        } else if (isConsultar) {
          console.log('🔍 Comando CONSULTAR PRODUTO identificado:', textoNormalizado);
          resposta += await processarComandoInteligente(supabase, mensagem, 'consultar');
          comandoExecutado = true;
        } else if (textoNormalizado.match(/\b(acabando|estoque baixo|baixo estoque|faltando)\b/)) {
          console.log('📉 Comando ESTOQUE BAIXO identificado');
          resposta += await processarEstoqueBaixo(supabase, mensagem);
          comandoExecutado = true;
        } else if (textoNormalizado.match(/\b(gastei|gastos?|quanto gastei|despesas?)\b/)) {
          console.log('💰 Comando RELATÓRIO GASTOS identificado');
          resposta += await processarRelatorioGastos(supabase, mensagem);
          comandoExecutado = true;
        } else if (textoNormalizado.match(/\b(preciso comprar|lista de compras|o que comprar)\b/)) {
          console.log('🛒 Comando LISTA COMPRAS identificado');
          resposta += await processarListaComprasInteligente(supabase, mensagem);
          comandoExecutado = true;
        } else if (textoNormalizado.match(/\b(preco|preço|historico|histórico)\b/) && textoNormalizado.match(/\b(do|da|de)\b/)) {
          console.log('📊 Comando HISTÓRICO PREÇOS identificado');
          resposta += await processarHistoricoPrecos(supabase, mensagem);
          comandoExecutado = true;
        } else {
          // PRIORIDADE 3: Usar interpretação inteligente como fallback
          console.log('🧠 [FALLBACK] Tentando interpretação inteligente...');
          const resultadoInteligente = await tentarInterpretacaoInteligente(supabase, mensagem);
          
          if (resultadoInteligente.processado) {
            resposta = resultadoInteligente.resposta;
            comandoExecutado = true;
          } else {
            // Realmente não reconhecido - enviar menu
            console.log('❌ [FALLBACK] Comando não reconhecido:', textoNormalizado);
            await supabase
              .from('whatsapp_sessions')
              .delete()
              .eq('usuario_id', mensagem.usuario_id)
              .eq('remetente', mensagem.remetente);
            
            console.log(`🗑️ [RESET] Sessões ativas removidas para ${mensagem.remetente}`);
            
            resposta = "👋 Olá, eu sou o Picotinho, seu assistente de compras!\n\n📋 *Comandos disponíveis:*\n\n📦 *Estoque*\n- Estoque (ver todo)\n- Consulta [produto]\n- Estoque baixo (o que tá acabando)\n\n➕➖ *Movimentações*\n- Baixa [qtd] [produto]\n- Aumenta [qtd] [produto]\n- Incluir [produto]\n\n📂 *Categorias*\n- Categoria [nome]\n\n💰 *Relatórios*\n- Quanto gastei?\n- Preço do [produto]\n- Lista de compras\n\n📎 *Notas*\n- Envie PDF/imagem de nota fiscal\n\n🎤 *Voz*\n- Envie áudio com seu comando!\n\n💡 Dica: Você pode usar comandos por voz!";
          }
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
    
    // Buscar TODOS os produtos com nomes similares (consolidação)
    const produtosEncontrados = estoques?.filter((item: any) => {
      const nomeEstoqueSimples = item.produto_nome.toLowerCase().trim();
      return nomeEstoqueSimples.includes(produtoNomeSimples) || 
             produtoNomeSimples.includes(nomeEstoqueSimples);
    }) || [];
    
    if (erroEstoque) {
      console.error('❌ Erro ao buscar estoque:', erroEstoque);
      return "Erro ao consultar estoque. Tente novamente.";
    }
    
    if (produtosEncontrados.length === 0) {
      return `Produto "${produtoNome}" não encontrado no seu estoque.`;
    }
    
    // Consolidar produtos somando quantidades
    const produtosConsolidados = produtosEncontrados.reduce((acc: any, item: any) => {
      const chave = item.produto_nome.toLowerCase().trim();
      
      if (!acc[chave]) {
        acc[chave] = {
          produto_nome: item.produto_nome,
          quantidade: 0,
          unidade_medida: item.unidade_medida,
          entradas: [] // Guardar todas as entradas para poder operar nelas
        };
      }
      
      acc[chave].quantidade += item.quantidade;
      acc[chave].entradas.push(item);
      return acc;
    }, {});
    
    // Pegar o primeiro produto consolidado
    const produtoConsolidado = Object.values(produtosConsolidados)[0] as any;
    const quantidadeTotalDisponivel = produtoConsolidado.quantidade;
    
    console.log(`📊 Produto consolidado: ${produtoConsolidado.produto_nome} - Total: ${quantidadeTotalDisponivel} ${produtoConsolidado.unidade_medida}`);
    console.log(`📊 Entradas encontradas: ${produtoConsolidado.entradas.length}`);
    
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
      // Se não foi especificada unidade, usar a unidade do estoque consolidado
      quantidadeConvertida = quantidade;
      unidadeFinal = produtoConsolidado.unidade_medida;
    }
    
    console.log(`📊 Quantidade convertida: ${quantidadeConvertida} (original: ${quantidade} ${unidadeExtraida || 'sem unidade'})`);
    
    // Verificar se há quantidade suficiente (usando quantidade consolidada)
    if (quantidadeTotalDisponivel < quantidadeConvertida) {
      const estoqueFormatado = formatarQuantidade(quantidadeTotalDisponivel, produtoConsolidado.unidade_medida);
      const tentouBaixarFormatado = formatarQuantidade(quantidade, unidadeFinal || produtoConsolidado.unidade_medida);
      
      return `❌ Estoque insuficiente!\n\nVocê tem: ${estoqueFormatado}\nTentou baixar: ${tentouBaixarFormatado}\n\nQuantidade disponível: ${estoqueFormatado}`;
    }
    
    // Ordenar entradas por data de atualização (mais recente primeiro)
    const entradasOrdenadas = produtoConsolidado.entradas.sort((a: any, b: any) => {
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
    
    // Baixar da entrada mais recente
    const entradaMaisRecente = entradasOrdenadas[0];
    let novaQuantidade = entradaMaisRecente.quantidade - quantidadeConvertida;
    
    // Arredondar SEMPRE com 3 casas decimais para precisão de miligrama
    novaQuantidade = Math.round(novaQuantidade * 1000) / 1000;
    
    if (novaQuantidade <= 0) {
      // Zerar produto do estoque (não deletar) - manter consistência com o app
      await supabase
        .from('estoque_app')
        .update({
          quantidade: 0,
          updated_at: new Date().toISOString()
        })
        .eq('id', entradaMaisRecente.id);
      
      // Recalcular total consolidado após a operação
      const novoTotalConsolidado = quantidadeTotalDisponivel - quantidadeConvertida;
      const baixadoFormatado = formatarQuantidade(quantidade, unidadeFinal || produtoConsolidado.unidade_medida);
      const estoqueAtualFormatado = formatarQuantidade(novoTotalConsolidado, produtoConsolidado.unidade_medida);
      
      return `✅ Produto retirado do estoque!\n\n📦 ${produtoConsolidado.produto_nome}\n🔢 Baixado: ${baixadoFormatado}\n📊 Estoque atual: ${estoqueAtualFormatado}`;
    } else {
      // Atualizar quantidade da entrada mais recente
      await supabase
        .from('estoque_app')
        .update({
          quantidade: novaQuantidade,
          updated_at: new Date().toISOString()
        })
        .eq('id', entradaMaisRecente.id);
      
      // Recalcular total consolidado após a operação
      const novoTotalConsolidado = quantidadeTotalDisponivel - quantidadeConvertida;
      const baixadoFormatado = formatarQuantidade(quantidade, unidadeFinal || produtoConsolidado.unidade_medida);
      const estoqueAtualFormatado = formatarQuantidade(novoTotalConsolidado, produtoConsolidado.unidade_medida);
      
      return `✅ Estoque atualizado!\n\n📦 ${produtoConsolidado.produto_nome}\n🔢 Baixado: ${baixadoFormatado}\n📊 Estoque atual: ${estoqueAtualFormatado}`;
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
    
    // Verificar se é consulta de estoque completo
    const isConsultaEstoqueCompleto = texto === "estoque" || 
                                       texto === "consulta estoque" ||
                                       texto === "consultar estoque" ||
                                       texto === "consulta" ||
                                       texto === "consultar";

    if (isConsultaEstoqueCompleto) {
      console.log(`📦 [CONSULTA COMPLETA] Retornando todo o estoque categorizado`);
      
      // Buscar TODO o estoque do usuário COM CATEGORIA
      const { data: estoques, error } = await supabase
        .from("estoque_app")
        .select("produto_nome, quantidade, unidade_medida, preco_unitario_ultimo, categoria")
        .eq("user_id", mensagem.usuario_id)
        .order("categoria, produto_nome");
      
      if (error) {
        console.error(`❌ Erro ao buscar estoque:`, error);
        return "❌ Erro ao consultar estoque.";
      }
      
      if (!estoques || estoques.length === 0) {
        return "📭 Seu estoque está vazio. Use 'Incluir [produto]' para adicionar itens.";
      }
      
      // Agrupar por categoria
      const categorias: any = {};
      
      estoques.forEach((item: any) => {
        const categoria = item.categoria || 'Sem Categoria';
        const chave = item.produto_nome.toUpperCase().trim();
        
        if (!categorias[categoria]) {
          categorias[categoria] = {};
        }
        
        if (!categorias[categoria][chave]) {
          categorias[categoria][chave] = {
            produto_nome: item.produto_nome,
            quantidade: 0,
            unidade_medida: item.unidade_medida,
            preco_unitario_ultimo: item.preco_unitario_ultimo || 0
          };
        }
        categorias[categoria][chave].quantidade += item.quantidade;
      });
      
      // Ordenar categorias alfabeticamente
      const categoriasOrdenadas = Object.keys(categorias).sort();
      
      // Montar resposta categorizada
      let resposta = "📦 **SEU ESTOQUE COMPLETO**\n\n";
      let contadorGeral = 1;
      let totalItens = 0;
      let valorTotalGeral = 0;
      
      categoriasOrdenadas.forEach(categoria => {
        const produtos = categorias[categoria];
        const qtdItensCategoria = Object.keys(produtos).length;
        let valorTotalCategoria = 0;
        
        // Cabeçalho da categoria
        resposta += `━━━━━━━━━━━━━━━━━━━━━\n`;
        resposta += `📂 **${categoria.toUpperCase()}**\n`;
        resposta += `━━━━━━━━━━━━━━━━━━━━━\n\n`;
        
        // Produtos da categoria
        Object.values(produtos).forEach((produto: any) => {
          const quantidadeFormatada = produto.quantidade.toFixed(3).replace('.', ',');
          const precoFormatado = produto.preco_unitario_ultimo > 0 
            ? `R$ ${produto.preco_unitario_ultimo.toFixed(2).replace('.', ',')}` 
            : 'R$ 0,00';
          const unidadeFormatada = produto.unidade_medida.toLowerCase();
          
          resposta += `${contadorGeral}. ${produto.produto_nome}\n`;
          resposta += `   📊 ${quantidadeFormatada} ${unidadeFormatada}`;
          resposta += ` | 💰 ${precoFormatado}/${unidadeFormatada}\n\n`;
          
          if (produto.preco_unitario_ultimo > 0) {
            valorTotalCategoria += produto.quantidade * produto.preco_unitario_ultimo;
          }
          
          contadorGeral++;
        });
        
        // Subtotal da categoria
        resposta += `📊 Subtotal ${categoria}: ${qtdItensCategoria} produto(s)`;
        if (valorTotalCategoria > 0) {
          resposta += ` | 💰 R$ ${valorTotalCategoria.toFixed(2).replace('.', ',')}`;
        }
        resposta += `\n\n`;
        
        totalItens += qtdItensCategoria;
        valorTotalGeral += valorTotalCategoria;
      });
      
      // Total geral
      resposta += `━━━━━━━━━━━━━━━━━━━━━\n`;
      resposta += `📊 **TOTAL GERAL**: ${totalItens} produto(s)`;
      if (valorTotalGeral > 0) {
        resposta += `\n💰 **VALOR TOTAL**: R$ ${valorTotalGeral.toFixed(2).replace('.', ',')}`;
      }
      resposta += `\n━━━━━━━━━━━━━━━━━━━━━`;
      
      return resposta;
      
    } else if (texto.includes("consulta")) {
      // Consulta de produto específico
      console.log(`✅ [STEP 2] Texto contém "consulta" - buscando produto específico...`);
      
      const partes = texto.split("consulta");
      console.log(`📋 [DEBUG] Partes após split: ${JSON.stringify(partes)}`);
      
      const produto = partes[1]?.trim();
      console.log(`📝 [STEP 3] Produto extraído: "${produto}"`);

      if (!produto || produto === "estoque") {
        console.log(`❌ [STEP 4] Produto vazio ou "estoque" - comando inválido`);
        return "❌ Você precisa informar um produto. Exemplo: 'consulta banana'\n\nPara ver todo o estoque, use apenas: 'ESTOQUE'";
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
      
      // Função para normalizar nome de produto (remove variações de "granel", "kg", etc)
      const normalizarNome = (nome: string): string => {
        return nome
          .toUpperCase()
          .trim()
          .replace(/\s+/g, ' ')
          .replace(/\b(GRANEL|KG|G|UN|PC|L|ML)\b/gi, '')
          .trim();
      };
      
      // Normalizar unidades para padrão Picotinho (Un, Kg, Lt)
      const normalizarUnidade = (unidade: string): string => {
        const unidadeLimpa = unidade?.toUpperCase().trim() || 'UN';
        const mapa: { [key: string]: string } = {
          'PC': 'Un', 'UNIDADE': 'Un', 'UN': 'Un', 'UND': 'Un',
          'G': 'Kg', 'GRAMAS': 'Kg', 'KG': 'Kg',
          'ML': 'Lt', 'L': 'Lt', 'LT': 'Lt'
        };
        return mapa[unidadeLimpa] || unidadeLimpa;
      };
      
      // Buscar TODOS os produtos similares (não apenas o primeiro)
      const produtosEncontrados = estoques?.filter((item: any) => {
        const nomeEstoqueNormalizado = normalizarNome(item.produto_nome);
        const produtoNormalizado = normalizarNome(produto);
        return nomeEstoqueNormalizado.includes(produtoNormalizado) || 
               produtoNormalizado.includes(nomeEstoqueNormalizado);
      }) || [];

      console.log(`📋 [STEP 6] Produtos encontrados:`, produtosEncontrados.length);
      console.log(`📋 [RESULT] Produtos:`, produtosEncontrados.map((p: any) => `${p.produto_nome}: ${p.quantidade} ${p.unidade_medida}`));

      if (produtosEncontrados.length === 0) {
        console.log(`❌ [STEP 7] Produto não encontrado - retornando erro`);
        return "❌ Produto não encontrado no seu estoque.";
      }

      // Consolidar produtos com o mesmo nome normalizado
      const produtosConsolidados = produtosEncontrados.reduce((acc: any, item: any) => {
        const nomeNormalizado = normalizarNome(item.produto_nome);
        
        if (!acc[nomeNormalizado]) {
          acc[nomeNormalizado] = {
            produto_nome: item.produto_nome,
            quantidade: 0,
            unidade_medida: normalizarUnidade(item.unidade_medida)
          };
        }
        
        acc[nomeNormalizado].quantidade += item.quantidade;
        return acc;
      }, {});
      
      // Pegar o primeiro produto consolidado
      const data = Object.values(produtosConsolidados)[0] as any;
      
      console.log(`✅ [STEP 8] Produto consolidado - preparando resposta`);
      console.log(`📊 Quantidade total:`, data.quantidade, data.unidade_medida);
      
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
    return "👋 Olá, eu sou o Picotinho, seu assistente de compras!\nEscolha uma das opções para começar:\n- Estoque (ver todo o estoque)\n- Consulta [produto]\n- Consulta Categoria [Nome da Categoria]\n- Incluir [produto]\n- Aumentar [quantidade] [produto]\n- Baixar [quantidade] [produto]\n- Inserir Nota (envie arquivo da nota fiscal)";

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
    
    // Buscar TODOS os produtos com nomes similares (consolidação)
    const produtosEncontrados = estoques?.filter((item: any) => {
      const nomeEstoqueSimples = item.produto_nome.toLowerCase().trim();
      const produtoSimples = produtoNomeNormalizado.toLowerCase().trim();
      return nomeEstoqueSimples.includes(produtoSimples) || 
             produtoSimples.includes(nomeEstoqueSimples);
    }) || [];
    
    if (erroEstoque) {
      console.error('❌ Erro ao buscar estoque:', erroEstoque);
      return "Erro ao consultar estoque. Tente novamente.";
    }
    
    if (produtosEncontrados.length === 0) {
      return `❌ Produto não encontrado no seu estoque. Use o comando 'criar' ou 'incluir' para adicionar um novo produto.`;
    }
    
    // Consolidar produtos somando quantidades
    const produtosConsolidados = produtosEncontrados.reduce((acc: any, item: any) => {
      const chave = item.produto_nome.toLowerCase().trim();
      
      if (!acc[chave]) {
        acc[chave] = {
          produto_nome: item.produto_nome,
          quantidade: 0,
          unidade_medida: item.unidade_medida,
          entradas: [] // Guardar todas as entradas para poder operar nelas
        };
      }
      
      acc[chave].quantidade += item.quantidade;
      acc[chave].entradas.push(item);
      return acc;
    }, {});
    
    // Pegar o primeiro produto consolidado
    const produtoConsolidado = Object.values(produtosConsolidados)[0] as any;
    const quantidadeTotalAntes = produtoConsolidado.quantidade;
    
    console.log(`📊 Produto consolidado: ${produtoConsolidado.produto_nome} - Total: ${quantidadeTotalAntes} ${produtoConsolidado.unidade_medida}`);
    console.log(`📊 Entradas encontradas: ${produtoConsolidado.entradas.length}`);
    
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
    
    // Ordenar entradas por data de atualização (mais recente primeiro)
    const entradasOrdenadas = produtoConsolidado.entradas.sort((a: any, b: any) => {
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
    
    // Aumentar na entrada mais recente
    const entradaMaisRecente = entradasOrdenadas[0];
    
    // Somar ao estoque existente da entrada mais recente e arredondar com 3 casas decimais
    const novaQuantidade = Math.round((entradaMaisRecente.quantidade + quantidadeConvertida) * 1000) / 1000;
    
    // Atualizar estoque com logs completos
    console.log(`🔄 Atualizando estoque ID: ${entradaMaisRecente.id}`);
    console.log(`📊 Quantidade atual: ${entradaMaisRecente.quantidade}`);
    console.log(`➕ Quantidade a adicionar: ${quantidadeConvertida}`);
    console.log(`🎯 Nova quantidade: ${novaQuantidade}`);
    
    const { data: updateResult, error: updateError } = await supabase
      .from('estoque_app')
      .update({
        quantidade: novaQuantidade,
        updated_at: new Date().toISOString()
      })
      .eq('id', entradaMaisRecente.id)
      .select();
    
    if (updateError) {
      console.error('❌ ERRO NA ATUALIZAÇÃO:', updateError);
      return `❌ Erro ao atualizar estoque: ${updateError.message}`;
    }
    
    console.log('✅ ESTOQUE ATUALIZADO COM SUCESSO:', updateResult);
    
    // Recalcular total consolidado após a operação
    const novoTotalConsolidado = quantidadeTotalAntes + quantidadeConvertida;
    const adicionadoFormatado = formatarQuantidade(quantidade, unidadeExtraida || produtoConsolidado.unidade_medida);
    const estoqueAtualFormatado = formatarQuantidade(novoTotalConsolidado, produtoConsolidado.unidade_medida);
    
    const produtoNomeLimpo = limparNomeProduto(produtoConsolidado.produto_nome);
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
      return "👋 Olá, eu sou o Picotinho, seu assistente de compras!\nEscolha uma das opções para começar:\n- Estoque (ver todo o estoque)\n- Consulta [produto]\n- Consulta Categoria [Nome da Categoria]\n- Incluir [produto]\n- Aumentar [quantidade] [produto]\n- Baixar [quantidade] [produto]\n- Inserir Nota (envie arquivo da nota fiscal)";
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
          
          return "👋 Olá, eu sou o Picotinho, seu assistente de compras!\nEscolha uma das opções para começar:\n- Estoque (ver todo o estoque)\n- Consulta [produto]\n- Consulta Categoria [Nome da Categoria]\n- Incluir [produto]\n- Aumentar [quantidade] [produto]\n- Baixar [quantidade] [produto]\n- Inserir Nota (envie arquivo da nota fiscal)";
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
          
          return "👋 Olá, eu sou o Picotinho, seu assistente de compras!\nEscolha uma das opções para começar:\n- Estoque (ver todo o estoque)\n- Consulta [produto]\n- Consulta Categoria [Nome da Categoria]\n- Incluir [produto]\n- Aumentar [quantidade] [produto]\n- Baixar [quantidade] [produto]\n- Inserir Nota (envie arquivo da nota fiscal)";
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
          
          return "👋 Olá, eu sou o Picotinho, seu assistente de compras!\nEscolha uma das opções para começar:\n- Estoque (ver todo o estoque)\n- Consulta [produto]\n- Consulta Categoria [Nome da Categoria]\n- Incluir [produto]\n- Aumentar [quantidade] [produto]\n- Baixar [quantidade] [produto]\n- Inserir Nota (envie arquivo da nota fiscal)";
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
          
          return "👋 Olá, eu sou o Picotinho, seu assistente de compras!\nEscolha uma das opções para começar:\n- Estoque (ver todo o estoque)\n- Consulta [produto]\n- Consulta Categoria [Nome da Categoria]\n- Incluir [produto]\n- Aumentar [quantidade] [produto]\n- Baixar [quantidade] [produto]\n- Inserir Nota (envie arquivo da nota fiscal)";
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
    
    // Extrair termo da categoria da mensagem (remover "consulta categoria")
    const termoCategoria = texto
      .replace(/\b(consulta|consultar)\b/g, '')
      .replace(/\bcategoria\b/g, '')
      .trim();
    
    console.log(`📝 [STEP 2] Termo da categoria extraído: "${termoCategoria}"`);
    
    if (!termoCategoria) {
      console.log(`❌ [STEP 2] Categoria não especificada - retornando ajuda`);
      return "❌ Categoria não especificada. Use: 'categoria [nome]'\n\nExemplos:\n• categoria carnes\n• categoria bebidas\n• categoria hortifruti\n• categoria mercearia\n• categoria limpeza";
    }
    
    // Buscar categoria usando a função do banco de dados
    console.log(`🔍 [STEP 3] Buscando categoria "${termoCategoria}" no banco...`);
    
    const { data: categoriaEncontrada, error: errorCategoria } = await supabase.rpc('buscar_categoria_por_termo', {
      termo_busca: termoCategoria
    });
    
    if (errorCategoria) {
      console.error('❌ [ERRO] Erro ao buscar categoria:', errorCategoria);
      return "❌ Erro ao buscar categoria. Tente novamente.";
    }
    
    if (!categoriaEncontrada || categoriaEncontrada.length === 0) {
      console.log(`❌ [STEP 3] Categoria "${termoCategoria}" não encontrada`);
      
      // Buscar todas as categorias disponíveis para ajuda
      const { data: todasCategorias } = await supabase
        .from('categorias')
        .select('nome, sinonimos')
        .eq('ativa', true)
        .order('nome');
      
      let ajuda = `❌ Categoria "${termoCategoria}" não encontrada.\n\n📂 **CATEGORIAS DISPONÍVEIS:**\n\n`;
      
      if (todasCategorias) {
        todasCategorias.forEach(cat => {
          const exemplos = cat.sinonimos ? cat.sinonimos.slice(0, 2).join(', ') : '';
          ajuda += `• ${cat.nome.toUpperCase()}${exemplos ? ` (ex: ${exemplos})` : ''}\n`;
        });
      }
      
      ajuda += '\n💡 Use: *categoria [nome]* para consultar uma categoria específica';
      return ajuda;
    }
    
    // Extrair o nome da categoria encontrada
    const categoriaNome = categoriaEncontrada[0]?.categoria_nome || termoCategoria;
    console.log(`✅ [STEP 3] Categoria encontrada: "${categoriaNome}"`);
    console.log(`🔍 [DEBUG] categoriaEncontrada:`, categoriaEncontrada);
    console.log(`🔍 [STEP 4] Iniciando busca de produtos...`);
    
    // Buscar produtos da categoria usando ILIKE e agrupando para evitar duplicatas
    const { data, error } = await supabase
      .from("estoque_app")
      .select("produto_nome, quantidade, unidade_medida, preco_unitario_ultimo")
      .eq("user_id", mensagem.usuario_id)
      .ilike("categoria", categoriaNome)
      .gt("quantidade", 0) // Apenas produtos com estoque
      .order("produto_nome");
    
    console.log(`📋 [STEP 5] Resultado do banco (antes da consolidação):`);
    console.log(`📋 [RESULT] Data:`, data);
    console.log(`📋 [RESULT] Error:`, error);
    
    if (error) {
      console.error('❌ [ERRO] Erro ao buscar produtos da categoria:', error);
      return "❌ Erro ao consultar estoque da categoria. Tente novamente.";
    }
    
    if (!data || data.length === 0) {
      console.log(`❌ [STEP 6] Nenhum produto encontrado na categoria`);
      return `❌ Nenhum produto encontrado na categoria "${categoriaNome}".`;
    }
    
    // Consolidar produtos duplicados (mesmo nome)
    const produtosConsolidados = new Map();
    
    data.forEach(produto => {
      const chave = produto.produto_nome.trim().toUpperCase();
      
      if (produtosConsolidados.has(chave)) {
        // Produto já existe - somar quantidade e manter preço mais recente
        const existente = produtosConsolidados.get(chave);
        existente.quantidade += produto.quantidade;
        
        // Manter o preço mais recente (maior valor, assumindo que é mais atual)
        if (produto.preco_unitario_ultimo && produto.preco_unitario_ultimo > (existente.preco_unitario_ultimo || 0)) {
          existente.preco_unitario_ultimo = produto.preco_unitario_ultimo;
        }
      } else {
        // Produto novo - adicionar ao mapa
        produtosConsolidados.set(chave, {
          produto_nome: produto.produto_nome,
          quantidade: produto.quantidade,
          unidade_medida: produto.unidade_medida,
          preco_unitario_ultimo: produto.preco_unitario_ultimo
        });
      }
    });
    
    // Converter mapa de volta para array
    const produtosFinais = Array.from(produtosConsolidados.values())
      .sort((a, b) => a.produto_nome.localeCompare(b.produto_nome));
    
    console.log(`🔄 [STEP 6] Produtos consolidados: ${produtosFinais.length} (eram ${data.length})`);
    console.log(`📋 [CONSOLIDATED] Data:`, produtosFinais);
    
    console.log(`✅ [STEP 7] ${produtosFinais.length} produtos únicos encontrados - preparando resposta`);
    
    // Montar resposta organizada
    let resposta = `📂 **${categoriaNome.toUpperCase()}** (${produtosFinais.length} item${produtosFinais.length > 1 ? 'ns' : ''})\n\n`;
    
    let valorTotal = 0;
    
    produtosFinais.forEach((produto, index) => {
      const produtoNomeLimpo = limparNomeProduto(produto.produto_nome);
      const quantidadeFormatada = formatarQuantidade(produto.quantidade, produto.unidade_medida);
      
      resposta += `${index + 1}. ${produtoNomeLimpo}\n`;
      resposta += `   📊 ${quantidadeFormatada}`;
      
      if (produto.preco_unitario_ultimo && produto.preco_unitario_ultimo > 0) {
        const precoFormatado = `R$ ${produto.preco_unitario_ultimo.toFixed(2).replace('.', ',')}`;
        const valorItem = produto.quantidade * produto.preco_unitario_ultimo;
        valorTotal += valorItem;
        
        const unidadeFormatada = produto.unidade_medida.toLowerCase();
        resposta += ` | 💰 ${precoFormatado}/${unidadeFormatada}`;
        resposta += ` | 💵 R$ ${valorItem.toFixed(2).replace('.', ',')}`;
      }
      
      resposta += '\n\n';
    });
    
    // Adicionar valor total se há preços
    if (valorTotal > 0) {
      resposta += `💰 **VALOR TOTAL**: R$ ${valorTotal.toFixed(2).replace('.', ',')}`;
    }
    
    console.log(`📤 [STEP 8] Resposta final preparada`);
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
    
    // CRÍTICO: Verificar shouldDelete ANTES de verificar approved
    // Isso evita processar notas duplicadas mesmo que approved=true
    if (validacao.shouldDelete) {
      console.log('🛑 Nota marcada para exclusão (shouldDelete=true):', validacao.reason);
      // A mensagem de rejeição já foi enviada pelo validate-receipt
      // NÃO continuar processamento
      return `❌ ${validacao.message || 'Esta nota fiscal já foi processada anteriormente.'}`;
    }
    
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
      
      // ✅ FLUXO AUTOMÁTICO: IA-1 → IA-2 (com retry para erro 503)
      console.log('🚀 PDF processado, disparando IA-2 automaticamente...');
      
      EdgeRuntime.waitUntil(
        (async () => {
          let tentativa = 0;
          const maxTentativas = 3;
          
          while (tentativa < maxTentativas) {
            try {
              tentativa++;
              console.log(`🔄 Tentativa ${tentativa}/${maxTentativas} de executar IA-2...`);
              
              const result = await supabase.functions.invoke('process-receipt-full', {
                body: { imagemId: notaImagem.id }
              });
              
              // Se retornou 503, lançar erro para retry
              if (result.error && (result.error.message?.includes('503') || result.error.message?.includes('Service Unavailable'))) {
                console.error(`⚠️ Erro 503 na tentativa ${tentativa}, aguardando retry...`);
                if (tentativa < maxTentativas) {
                  await new Promise(resolve => setTimeout(resolve, 2000)); // Aguardar 2s antes de retry
                  continue; // Tentar novamente
                } else {
                  throw new Error('Serviço indisponível após 3 tentativas (503)');
                }
              }
              
              // Qualquer outro erro que não seja 503, lançar imediatamente
              if (result.error) {
                throw new Error(result.error.message || 'Erro desconhecido na IA-2');
              }
              
              console.log("✅ IA-2 executada com sucesso:", result);
              return result; // Sucesso, sair do loop
              
            } catch (error) {
              console.error(`❌ Erro na tentativa ${tentativa}:`, error);
              if (tentativa >= maxTentativas) {
                throw error; // Esgotar tentativas, lançar erro final
              }
            }
          }
        })().catch((error) => {
          console.error('❌ Falha na IA-2 após todas as tentativas:', error);
          throw error; // Re-lançar para ser capturado pelo catch externo
        })
      );
      
    } else {
      // Para imagens: IA-1 (extração) → IA-2 (estoque)
      console.log('🖼️ Processando imagem - iniciando extração de dados...');
      
      // ETAPA 1: Extrair dados da imagem
      const extractResult = await supabase.functions.invoke('extract-receipt-image', {
        body: { 
          imagemId: notaImagem.id,
          userId: mensagem.usuario_id
        }
      });
      
      console.log('✅ Extração de imagem concluída:', extractResult);
      
      if (extractResult.error) {
        throw new Error(`Erro na extração da imagem: ${extractResult.error.message}`);
      }
      
      // ✅ FLUXO AUTOMÁTICO: extract-receipt-image já dispara process-receipt-full automaticamente
      console.log('✅ Imagem extraída - IA-2 será executada automaticamente pelo extract-receipt-image');
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

async function processarSolicitarLista(supabase: any, mensagem: any): Promise<string> {
  console.log('📋 Processando solicitação de lista de compras');
  
  try {
    // Extrair título da lista dos parâmetros
    const parametros = mensagem.webhook_data?.picotinho_params || 
                       mensagem.parametros_comando;
    const tituloSolicitado = parametros?.titulo_lista || '';
    
    if (!tituloSolicitado) {
      return "❌ Por favor, informe o nome da lista que deseja receber.\n\nExemplo: *lista de compras Semana 1*";
    }
    
    console.log(`🔍 Buscando lista com título similar a: "${tituloSolicitado}"`);
    console.log('✅ [VERSÃO NOVA] Usando normalização de texto - v2');
    
    // Normalizar texto removendo acentos e convertendo para minúsculas
    const normalizarTexto = (texto: string) => {
      return texto
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
    };
    
    const tituloNormalizado = normalizarTexto(tituloSolicitado);
    console.log(`🔍 Título normalizado para busca: "${tituloNormalizado}"`);
    
    // Buscar TODAS as listas do usuário e filtrar no código
    const { data: todasAsListas, error } = await supabase
      .from('listas_compras')
      .select('*, listas_compras_itens(*)')
      .eq('user_id', mensagem.usuario_id)
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('❌ Erro ao buscar listas:', error);
      throw error;
    }
    
    console.log(`📋 Total de listas do usuário: ${todasAsListas?.length || 0}`);
    
    // Filtrar listas que contenham o texto normalizado
    const listas = todasAsListas?.filter((lista: any) => {
      const tituloListaNormalizado = normalizarTexto(lista.titulo);
      console.log(`  🔍 Comparando: "${tituloListaNormalizado}" contains "${tituloNormalizado}"? ${tituloListaNormalizado.includes(tituloNormalizado)}`);
      return tituloListaNormalizado.includes(tituloNormalizado);
    }) || [];
    
    console.log(`✅ Listas encontradas após filtro: ${listas.length}`);
    
    if (!listas || listas.length === 0) {
      // Nenhuma lista encontrada - sugerir listas disponíveis
      const { data: todasListas } = await supabase
        .from('listas_compras')
        .select('titulo')
        .eq('user_id', mensagem.usuario_id)
        .order('created_at', { ascending: false })
        .limit(5);
      
      let resposta = `❌ Não encontrei nenhuma lista com o nome "${tituloSolicitado}".\n\n`;
      
      if (todasListas && todasListas.length > 0) {
        resposta += "📋 *Suas listas disponíveis:*\n\n";
        todasListas.forEach((lista: any) => {
          resposta += `• ${lista.titulo}\n`;
        });
        resposta += "\n💡 Digite: *lista de compras [nome exato]*";
      } else {
        resposta += "Você ainda não tem listas de compras criadas.";
      }
      
      return resposta;
    }
    
    if (listas.length > 1) {
      // Múltiplas listas encontradas - pedir especificação
      let resposta = `📋 Encontrei ${listas.length} listas com esse nome:\n\n`;
      listas.forEach((lista: any, index: number) => {
        const totalItens = lista.listas_compras_itens?.length || 0;
        resposta += `${index + 1}. *${lista.titulo}* (${totalItens} produtos)\n`;
      });
      resposta += "\n💡 Digite o nome completo da lista que deseja receber.";
      
      return resposta;
    }
    
    // Lista encontrada - processar e enviar
    const lista = listas[0];
    console.log(`✅ Lista encontrada: ${lista.titulo} (ID: ${lista.id})`);
    
    // Verificar se tem itens
    if (!lista.listas_compras_itens || lista.listas_compras_itens.length === 0) {
      return `📋 A lista *"${lista.titulo}"* está vazia.\n\nAdicione produtos para poder compará-la entre mercados!`;
    }
    
    // Invocar função de comparação de preços
    console.log('💰 Invocando comparação de preços...');
    console.log(`📋 Lista ID: ${lista.id}, User ID: ${mensagem.usuario_id}`);
    
    const { data: comparacao, error: erroComparacao } = await supabase.functions.invoke(
      'comparar-precos-lista',
      {
        body: {
          userId: mensagem.usuario_id,
          listaId: lista.id
        },
        headers: {
          Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
        }
      }
    );
    
    console.log('📊 Resposta da comparação:', JSON.stringify(comparacao).substring(0, 200));
    
    if (erroComparacao) {
      console.error('❌ Erro ao comparar preços:', erroComparacao);
      return `❌ Erro ao processar a lista "${lista.titulo}".\n\nTente novamente em alguns instantes.`;
    }
    
    if (!comparacao || !comparacao.otimizado) {
      console.error('❌ Comparação retornou dados inválidos');
      return `❌ Não foi possível processar a lista "${lista.titulo}".\n\nVerifique se os produtos têm preços cadastrados.`;
    }
    
    // Verificar se há produtos sem preço
    if (comparacao.produtosSemPreco && comparacao.produtosSemPreco.length > 0) {
      let avisoPrecos = `⚠️ Alguns produtos não têm preços cadastrados:\n`;
      comparacao.produtosSemPreco.forEach((prod: string) => {
        avisoPrecos += `• ${prod}\n`;
      });
      avisoPrecos += "\nℹ️ Estes produtos não serão incluídos na comparação.\n\n";
    }
    
    // Formatar usando a mesma função do enviar-lista-whatsapp
    const mensagemFormatada = formatarListaComprasParaWhatsApp({
      lista_titulo: lista.titulo,
      modo_ativo: 'otimizado',
      dados_comparacao: comparacao.otimizado
    });
    
    console.log('✅ Lista formatada e pronta para envio');
    return mensagemFormatada;
    
  } catch (error: any) {
    console.error('❌ Erro ao processar solicitação de lista:', error);
    return `❌ Erro ao processar sua solicitação: ${error.message}\n\nTente novamente ou entre em contato com o suporte.`;
  }
}

// Função auxiliar para formatar lista (reutilizar lógica)
function formatarListaComprasParaWhatsApp(dados: any): string {
  const { lista_titulo, dados_comparacao } = dados;
  
  if (!dados_comparacao) {
    return `❌ Não foi possível gerar a comparação de preços para a lista "${lista_titulo}".`;
  }
  
  let mensagem = `🛒 *Lista: ${lista_titulo}*\n\n`;
  mensagem += `💰 *Opção Otimizada*\n`;
  mensagem += `*Total: R$ ${dados_comparacao.total.toFixed(2)}*\n\n`;
  
  if (dados_comparacao.economia && dados_comparacao.economia > 0) {
    mensagem += `🎯 *Economia de R$ ${dados_comparacao.economia.toFixed(2)}*\n`;
    mensagem += `   (${dados_comparacao.percentualEconomia?.toFixed(1)}% mais barato)\n\n`;
  }
  
  mensagem += `━━━━━━━━━━━━━━━━━━━━\n\n`;
  
  // Listar produtos por mercado
  dados_comparacao.mercados?.forEach((mercado: any, index: number) => {
    mensagem += `🏪 *${mercado.nome}*\n`;
    mensagem += `💵 Subtotal: R$ ${mercado.total.toFixed(2)}\n\n`;
    
    mercado.produtos?.forEach((produto: any) => {
      mensagem += `  ☐ ${produto.produto_nome}\n`;
      mensagem += `     ${produto.quantidade} ${produto.unidade_medida} × R$ ${produto.preco_unitario.toFixed(2)}\n`;
      mensagem += `     = R$ ${(produto.quantidade * produto.preco_unitario).toFixed(2)}\n\n`;
    });
    
    if (index < dados_comparacao.mercados.length - 1) {
      mensagem += `━━━━━━━━━━━━━━━━━━━━\n\n`;
    }
  });
  
  mensagem += `━━━━━━━━━━━━━━━━━━━━\n`;
  mensagem += `✅ *TOTAL GERAL: R$ ${dados_comparacao.total.toFixed(2)}*\n\n`;
  mensagem += `📱 _Lista gerada pelo Picotinho_`;
  
  return mensagem;
}

/**
 * 🎤 Processar áudio - transcreve e interpreta comando de voz
 */
async function processarAudio(supabase: any, mensagem: any): Promise<string> {
  try {
    console.log('🎤 Processando áudio...');
    
    const anexoInfo = mensagem.anexo_info;
    if (!anexoInfo?.url) {
      return "❌ Não consegui acessar o áudio. Tente enviar novamente.";
    }

    // 1. Transcrever áudio usando Whisper
    console.log('🎤 Transcrevendo áudio...');
    const { data: transcricao, error: erroTranscricao } = await supabase.functions.invoke(
      'transcribe-audio',
      {
        body: { audioUrl: anexoInfo.url }
      }
    );

    if (erroTranscricao || !transcricao?.text) {
      console.error('❌ Erro na transcrição:', erroTranscricao);
      return "❌ Não consegui entender o áudio. Tente falar mais claramente ou envie um texto.";
    }

    const textoTranscrito = transcricao.text;
    console.log('✅ Transcrição:', textoTranscrito);

    // 2. Interpretar o comando transcrito
    const { data: interpretacao, error: erroInterpretacao } = await supabase.functions.invoke(
      'interpret-command',
      {
        body: {
          texto: textoTranscrito,
          usuarioId: mensagem.usuario_id
        }
      }
    );

    if (erroInterpretacao || !interpretacao?.interpretacao) {
      console.error('❌ Erro na interpretação:', erroInterpretacao);
      // Fallback: processar como texto normal
      const mensagemClone = { ...mensagem, conteudo: textoTranscrito };
      return await processarTextoComoComando(supabase, mensagemClone, textoTranscrito);
    }

    const cmd = interpretacao.interpretacao;
    console.log('🧠 Comando interpretado:', cmd.comando, 'Confiança:', cmd.confianca);

    // 3. Se precisa desambiguação, criar sessão e perguntar
    if (cmd.precisaDesambiguacao) {
      await criarSessaoDesambiguacao(supabase, mensagem, cmd);
      return `🎤 _"${textoTranscrito}"_\n\n${cmd.mensagemDesambiguacao}`;
    }

    // 4. Executar comando interpretado
    const resultado = await executarComandoInterpretado(supabase, mensagem, cmd);
    return `🎤 _"${textoTranscrito}"_\n\n${resultado}`;

  } catch (error: any) {
    console.error('❌ Erro ao processar áudio:', error);
    return "❌ Erro ao processar áudio. Tente enviar um texto ou áudio mais curto.";
  }
}

/**
 * 🧠 Processar comando com interpretação inteligente
 */
async function processarComandoInteligente(supabase: any, mensagem: any, tipoComando: string): Promise<string> {
  try {
    console.log(`🧠 Processando comando inteligente: ${tipoComando}`);
    
    // Interpretar o comando
    const { data: interpretacao, error: erroInterpretacao } = await supabase.functions.invoke(
      'interpret-command',
      {
        body: {
          texto: mensagem.conteudo,
          usuarioId: mensagem.usuario_id
        }
      }
    );

    if (erroInterpretacao || !interpretacao?.interpretacao) {
      console.log('⚠️ Interpretação falhou, usando fallback...');
      // Fallback para processamento original
      if (tipoComando === 'baixar') {
        return await processarBaixarEstoque(supabase, mensagem);
      } else if (tipoComando === 'aumentar') {
        return await processarAumentarEstoque(supabase, mensagem);
      } else if (tipoComando === 'consultar') {
        return await processarConsultarEstoque(supabase, mensagem);
      }
      return "❌ Não consegui interpretar o comando.";
    }

    const cmd = interpretacao.interpretacao;
    console.log('🧠 Interpretação:', JSON.stringify(cmd, null, 2));

    // Se precisa desambiguação
    if (cmd.precisaDesambiguacao) {
      await criarSessaoDesambiguacao(supabase, mensagem, cmd);
      return cmd.mensagemDesambiguacao || "🤔 Qual produto você quer?";
    }

    // Executar comando
    return await executarComandoInterpretado(supabase, mensagem, cmd);

  } catch (error: any) {
    console.error('❌ Erro no comando inteligente:', error);
    // Fallback para processamento original
    if (tipoComando === 'baixar') {
      return await processarBaixarEstoque(supabase, mensagem);
    } else if (tipoComando === 'aumentar') {
      return await processarAumentarEstoque(supabase, mensagem);
    } else if (tipoComando === 'consultar') {
      return await processarConsultarEstoque(supabase, mensagem);
    }
    return "❌ Erro ao processar comando.";
  }
}

/**
 * Criar sessão de desambiguação
 */
async function criarSessaoDesambiguacao(supabase: any, mensagem: any, cmd: any) {
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + 5); // 5 minutos de timeout
  
  await supabase.from('whatsapp_sessions').insert({
    usuario_id: mensagem.usuario_id,
    remetente: mensagem.remetente,
    estado: `desambiguacao_${cmd.comando}`,
    produto_nome: cmd.produto,
    dados_sessao: {
      comando: cmd.comando,
      quantidade: cmd.quantidade,
      unidade: cmd.unidade,
      opcoes: cmd.opcoes,
      produtosEncontrados: cmd.produtosEncontrados
    },
    expires_at: expiresAt.toISOString()
  });
  
  console.log('📝 Sessão de desambiguação criada');
}

/**
 * Executar comando interpretado pela IA
 */
async function executarComandoInterpretado(supabase: any, mensagem: any, cmd: any): Promise<string> {
  try {
    switch (cmd.comando) {
      case 'baixar':
        if (!cmd.produtosEncontrados?.length) {
          return `❌ Produto "${cmd.produto}" não encontrado no seu estoque.`;
        }
        const produtoBaixar = cmd.produtosEncontrados[0];
        return await executarBaixarProduto(supabase, mensagem.usuario_id, produtoBaixar, cmd.quantidade, cmd.unidade);
        
      case 'aumentar':
        if (!cmd.produtosEncontrados?.length) {
          return `❌ Produto "${cmd.produto}" não encontrado no seu estoque.\n\nUse "Incluir ${cmd.produto}" para cadastrar primeiro.`;
        }
        const produtoAumentar = cmd.produtosEncontrados[0];
        return await executarAumentarProduto(supabase, mensagem.usuario_id, produtoAumentar, cmd.quantidade, cmd.unidade);
        
      case 'consultar':
        if (!cmd.produtosEncontrados?.length) {
          return `❌ Produto "${cmd.produto}" não encontrado no seu estoque.`;
        }
        return formatarConsultaProduto(cmd.produtosEncontrados);
        
      case 'estoque_baixo':
        return await processarEstoqueBaixo(supabase, mensagem);
        
      case 'relatorio_gastos':
        return await processarRelatorioGastos(supabase, mensagem);
        
      case 'lista_compras':
        return await processarListaComprasInteligente(supabase, mensagem);
        
      case 'historico_precos':
        return await processarHistoricoPrecos(supabase, mensagem);
        
      case 'cancelar':
        await supabase
          .from('whatsapp_sessions')
          .delete()
          .eq('usuario_id', mensagem.usuario_id)
          .eq('remetente', mensagem.remetente);
        return "✅ Operação cancelada!";
        
      default:
        return "🤔 Não entendi o comando. Tente novamente.";
    }
  } catch (error: any) {
    console.error('❌ Erro ao executar comando:', error);
    return `❌ Erro: ${error.message}`;
  }
}

/**
 * Executar baixa de produto específico
 */
async function executarBaixarProduto(supabase: any, userId: string, produto: any, quantidade: number, unidade?: string): Promise<string> {
  try {
    // Buscar produto no estoque
    const { data: estoque, error } = await supabase
      .from('estoque_app')
      .select('*')
      .eq('user_id', userId)
      .ilike('produto_nome', produto.produto_nome)
      .limit(1)
      .maybeSingle();
    
    if (error || !estoque) {
      return `❌ Produto não encontrado no estoque.`;
    }
    
    // Converter unidade se necessário
    let qtdConvertida = quantidade || 1;
    if (unidade?.match(/^(g|gr|gramas?)$/i) && estoque.unidade_medida.toLowerCase().includes('kg')) {
      qtdConvertida = quantidade / 1000;
    }
    
    if (estoque.quantidade < qtdConvertida) {
      return `❌ Estoque insuficiente!\n\nVocê tem: ${estoque.quantidade.toFixed(3).replace('.', ',')} ${estoque.unidade_medida}\nTentou baixar: ${quantidade} ${unidade || estoque.unidade_medida}`;
    }
    
    const novaQtd = Math.round((estoque.quantidade - qtdConvertida) * 1000) / 1000;
    
    await supabase
      .from('estoque_app')
      .update({ quantidade: novaQtd, updated_at: new Date().toISOString() })
      .eq('id', estoque.id);
    
    return `✅ Estoque atualizado!\n\n📦 ${estoque.produto_nome}\n🔢 Baixado: ${quantidade} ${unidade || estoque.unidade_medida}\n📊 Estoque atual: ${novaQtd.toFixed(3).replace('.', ',')} ${estoque.unidade_medida}`;
    
  } catch (error: any) {
    console.error('❌ Erro ao baixar produto:', error);
    return `❌ Erro ao baixar do estoque: ${error.message}`;
  }
}

/**
 * Executar aumento de produto específico
 */
async function executarAumentarProduto(supabase: any, userId: string, produto: any, quantidade: number, unidade?: string): Promise<string> {
  try {
    const { data: estoque, error } = await supabase
      .from('estoque_app')
      .select('*')
      .eq('user_id', userId)
      .ilike('produto_nome', produto.produto_nome)
      .limit(1)
      .maybeSingle();
    
    if (error || !estoque) {
      return `❌ Produto não encontrado no estoque.`;
    }
    
    let qtdConvertida = quantidade || 1;
    if (unidade?.match(/^(g|gr|gramas?)$/i) && estoque.unidade_medida.toLowerCase().includes('kg')) {
      qtdConvertida = quantidade / 1000;
    }
    
    const novaQtd = Math.round((estoque.quantidade + qtdConvertida) * 1000) / 1000;
    
    await supabase
      .from('estoque_app')
      .update({ quantidade: novaQtd, updated_at: new Date().toISOString() })
      .eq('id', estoque.id);
    
    return `✅ Estoque atualizado!\n\n📦 ${estoque.produto_nome}\n🔢 Adicionado: ${quantidade} ${unidade || estoque.unidade_medida}\n📊 Estoque atual: ${novaQtd.toFixed(3).replace('.', ',')} ${estoque.unidade_medida}`;
    
  } catch (error: any) {
    console.error('❌ Erro ao aumentar produto:', error);
    return `❌ Erro ao aumentar estoque: ${error.message}`;
  }
}

/**
 * Formatar consulta de produtos
 */
function formatarConsultaProduto(produtos: any[]): string {
  if (!produtos?.length) return "❌ Nenhum produto encontrado.";
  
  let resp = "📦 *Produtos encontrados:*\n\n";
  produtos.forEach((p, i) => {
    resp += `${i + 1}. ${p.produto_nome}\n`;
    resp += `   📊 ${p.quantidade?.toFixed(3).replace('.', ',')} ${p.unidade_medida}\n\n`;
  });
  return resp;
}

/**
 * Processar comando de estoque baixo
 */
async function processarEstoqueBaixo(supabase: any, mensagem: any): Promise<string> {
  try {
    const { data: produtosBaixos, error } = await supabase
      .from('estoque_app')
      .select('produto_nome, quantidade, unidade_medida, categoria')
      .eq('user_id', mensagem.usuario_id)
      .lt('quantidade', 0.5) // Produtos com menos de 0.5 unidades
      .gt('quantidade', 0)   // Mas que não estão zerados
      .order('quantidade', { ascending: true })
      .limit(20);
    
    if (error) {
      return "❌ Erro ao consultar estoque.";
    }
    
    if (!produtosBaixos?.length) {
      return "✅ Todos os produtos estão com estoque adequado! 🎉";
    }
    
    let resp = "⚠️ *Produtos acabando:*\n\n";
    produtosBaixos.forEach((p: any, i: number) => {
      resp += `${i + 1}. ${p.produto_nome}\n`;
      resp += `   📊 ${p.quantidade.toFixed(3).replace('.', ',')} ${p.unidade_medida}\n`;
      resp += `   📂 ${p.categoria || 'Sem categoria'}\n\n`;
    });
    resp += `\n💡 _Total: ${produtosBaixos.length} produto(s) com estoque baixo_`;
    return resp;
    
  } catch (error: any) {
    return `❌ Erro: ${error.message}`;
  }
}

/**
 * Processar relatório de gastos
 */
async function processarRelatorioGastos(supabase: any, mensagem: any): Promise<string> {
  try {
    const texto = mensagem.conteudo.toLowerCase();
    
    // Determinar período
    let dataInicio = new Date();
    let periodo = 'esta semana';
    
    if (texto.includes('mes') || texto.includes('mês')) {
      dataInicio.setDate(1); // Primeiro dia do mês
      periodo = 'este mês';
    } else if (texto.includes('hoje')) {
      dataInicio.setHours(0, 0, 0, 0);
      periodo = 'hoje';
    } else {
      // Padrão: última semana
      dataInicio.setDate(dataInicio.getDate() - 7);
    }
    
    const { data: notas, error } = await supabase
      .from('notas_imagens')
      .select('dados_extraidos, data_criacao')
      .eq('usuario_id', mensagem.usuario_id)
      .gte('data_criacao', dataInicio.toISOString())
      .eq('processada', true);
    
    if (error) {
      return "❌ Erro ao consultar gastos.";
    }
    
    if (!notas?.length) {
      return `📊 Nenhuma compra registrada ${periodo}.`;
    }
    
    let totalGeral = 0;
    const categorias: { [key: string]: number } = {};
    
    notas.forEach((nota: any) => {
      const dados = nota.dados_extraidos;
      const total = dados?.total || 0;
      totalGeral += total;
      
      // Agrupar por estabelecimento
      const estabelecimento = dados?.estabelecimento?.nome || 'Outros';
      categorias[estabelecimento] = (categorias[estabelecimento] || 0) + total;
    });
    
    let resp = `💰 *Gastos ${periodo}:*\n\n`;
    resp += `💵 *Total: R$ ${totalGeral.toFixed(2).replace('.', ',')}*\n\n`;
    
    resp += `📊 *Por estabelecimento:*\n`;
    Object.entries(categorias)
      .sort((a, b) => b[1] - a[1])
      .forEach(([nome, valor]) => {
        resp += `• ${nome}: R$ ${valor.toFixed(2).replace('.', ',')}\n`;
      });
    
    resp += `\n📝 _${notas.length} compra(s) registrada(s)_`;
    return resp;
    
  } catch (error: any) {
    return `❌ Erro: ${error.message}`;
  }
}

/**
 * Processar lista de compras inteligente
 */
async function processarListaComprasInteligente(supabase: any, mensagem: any): Promise<string> {
  try {
    // Buscar produtos com estoque baixo ou zerado
    const { data: produtosBaixos, error } = await supabase
      .from('estoque_app')
      .select('produto_nome, quantidade, unidade_medida, categoria, preco_unitario_ultimo')
      .eq('user_id', mensagem.usuario_id)
      .lt('quantidade', 1)
      .order('categoria, produto_nome');
    
    if (error) {
      return "❌ Erro ao gerar lista de compras.";
    }
    
    if (!produtosBaixos?.length) {
      return "✅ Seu estoque está completo! Nenhum produto para comprar. 🎉";
    }
    
    let resp = "🛒 *Lista de Compras Sugerida:*\n\n";
    let totalEstimado = 0;
    let categoriaAtual = '';
    
    produtosBaixos.forEach((p: any, i: number) => {
      if (p.categoria !== categoriaAtual) {
        if (categoriaAtual) resp += '\n';
        resp += `📂 *${p.categoria?.toUpperCase() || 'OUTROS'}*\n`;
        categoriaAtual = p.categoria;
      }
      
      resp += `☐ ${p.produto_nome}`;
      if (p.preco_unitario_ultimo > 0) {
        resp += ` (~R$ ${p.preco_unitario_ultimo.toFixed(2).replace('.', ',')})`;
        totalEstimado += p.preco_unitario_ultimo;
      }
      resp += `\n`;
    });
    
    resp += `\n━━━━━━━━━━━━━━━━━━━━\n`;
    resp += `📝 *Total: ${produtosBaixos.length} item(s)*\n`;
    if (totalEstimado > 0) {
      resp += `💰 *Estimativa: R$ ${totalEstimado.toFixed(2).replace('.', ',')}*\n`;
    }
    
    return resp;
    
  } catch (error: any) {
    return `❌ Erro: ${error.message}`;
  }
}

/**
 * Processar histórico de preços
 */
async function processarHistoricoPrecos(supabase: any, mensagem: any): Promise<string> {
  try {
    const texto = mensagem.conteudo.toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/\b(preco|preço|historico|histórico|do|da|de)\b/g, '')
      .trim();
    
    if (!texto) {
      return "❌ Informe o produto. Ex: 'preço do leite'";
    }
    
    // Buscar preços recentes
    const { data: precos, error } = await supabase
      .from('precos_atuais')
      .select('produto_nome, valor_unitario, estabelecimento_nome, data_atualizacao')
      .eq('user_id', mensagem.usuario_id)
      .ilike('produto_nome', `%${texto}%`)
      .order('data_atualizacao', { ascending: false })
      .limit(10);
    
    if (error) {
      return "❌ Erro ao consultar preços.";
    }
    
    if (!precos?.length) {
      return `❌ Nenhum histórico de preços encontrado para "${texto}".`;
    }
    
    let resp = `💰 *Preços de ${texto}:*\n\n`;
    
    const produtosAgrupados: { [key: string]: any[] } = {};
    precos.forEach((p: any) => {
      const chave = p.produto_nome;
      if (!produtosAgrupados[chave]) produtosAgrupados[chave] = [];
      produtosAgrupados[chave].push(p);
    });
    
    Object.entries(produtosAgrupados).forEach(([nome, items]) => {
      resp += `📦 *${nome}*\n`;
      items.forEach((item: any) => {
        const data = new Date(item.data_atualizacao).toLocaleDateString('pt-BR');
        resp += `   🏪 ${item.estabelecimento_nome}\n`;
        resp += `   💵 R$ ${item.valor_unitario.toFixed(2).replace('.', ',')} (${data})\n\n`;
      });
    });
    
    return resp;
    
  } catch (error: any) {
    return `❌ Erro: ${error.message}`;
  }
}

/**
 * Tentar interpretação inteligente como fallback
 */
async function tentarInterpretacaoInteligente(supabase: any, mensagem: any): Promise<{ processado: boolean, resposta: string }> {
  try {
    const { data: interpretacao, error } = await supabase.functions.invoke(
      'interpret-command',
      {
        body: {
          texto: mensagem.conteudo,
          usuarioId: mensagem.usuario_id
        }
      }
    );
    
    if (error || !interpretacao?.interpretacao) {
      return { processado: false, resposta: '' };
    }
    
    const cmd = interpretacao.interpretacao;
    
    if (cmd.comando === 'desconhecido' || cmd.confianca < 0.5) {
      return { processado: false, resposta: '' };
    }
    
    if (cmd.precisaDesambiguacao) {
      await criarSessaoDesambiguacao(supabase, mensagem, cmd);
      return { processado: true, resposta: cmd.mensagemDesambiguacao || "🤔 Qual produto você quer?" };
    }
    
    const resultado = await executarComandoInterpretado(supabase, mensagem, cmd);
    return { processado: true, resposta: resultado };
    
  } catch (error) {
    console.error('❌ Erro na interpretação inteligente:', error);
    return { processado: false, resposta: '' };
  }
}

/**
 * Processar texto como comando (fallback para áudio)
 */
async function processarTextoComoComando(supabase: any, mensagem: any, texto: string): Promise<string> {
  const textoLower = texto.toLowerCase();
  
  if (textoLower.match(/\b(baixa|baixar)\b/)) {
    return await processarBaixarEstoque(supabase, { ...mensagem, conteudo: texto });
  } else if (textoLower.match(/\b(aumenta|aumentar)\b/)) {
    return await processarAumentarEstoque(supabase, { ...mensagem, conteudo: texto });
  } else if (textoLower.match(/\b(consulta|consultar|estoque)\b/)) {
    return await processarConsultarEstoque(supabase, { ...mensagem, conteudo: texto });
  } else if (textoLower.match(/\b(acabando|estoque baixo)\b/)) {
    return await processarEstoqueBaixo(supabase, mensagem);
  } else if (textoLower.match(/\b(gastei|gastos?)\b/)) {
    return await processarRelatorioGastos(supabase, mensagem);
  }
  
  return `❌ Não entendi o comando.\n\n_Transcrição: "${texto}"_\n\nTente novamente ou envie um texto.`;
}

serve(handler);