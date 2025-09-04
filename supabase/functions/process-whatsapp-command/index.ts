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

    // Buscar mensagem para processar
    const { data: mensagem, error: erroMensagem } = await supabase
      .from('whatsapp_mensagens')
      .select('*')
      .eq('id', messageId)
      .eq('processada', false)
      .maybeSingle();

    if (erroMensagem || !mensagem) {
      console.error('❌ Mensagem não encontrada:', erroMensagem);
      return new Response('Mensagem não encontrada', { status: 404, headers: corsHeaders });
    }

    console.log('📨 Processando mensagem:', mensagem.conteudo);

    let resposta = "Olá! Sou o Picotinho 🤖\n\n";
    let comandoExecutado = false;

    // Processar comandos baseado no comando_identificado
    switch (mensagem.comando_identificado) {
      case 'baixar_estoque':
        resposta += await processarBaixarEstoque(supabase, mensagem);
        comandoExecutado = true;
        break;
        
      case 'consultar_estoque':
        resposta += await processarConsultarEstoque(supabase, mensagem);
        comandoExecutado = true;
        break;
        
      case 'adicionar_produto':
        resposta += await processarAdicionarProduto(supabase, mensagem);
        comandoExecutado = true;
        break;
        
      default:
        resposta += "Não entendi seu comando 😅\n\n";
        resposta += "Comandos disponíveis:\n";
        resposta += "• Picotinho, baixa X de [produto]\n";
        resposta += "• Picotinho, consulta [produto]\n";
        resposta += "• Picotinho, adiciona [produto]";
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

/**
 * Processar comando de baixar estoque
 */
async function processarBaixarEstoque(supabase: any, mensagem: any): Promise<string> {
  try {
    console.log('📦 Processando comando baixar estoque...');
    
    // Extrair produto e quantidade do texto
    const texto = mensagem.conteudo.toLowerCase();
    
    // Regex para extrair quantidade e produto
    const regexQuantidade = /(\d+(?:[.,]\d+)?)\s*(kg|kilos?|quilos?|g|gramas?|l|litros?|ml|unidade|un|pacote)?\s*(?:de\s+)?(.+)/i;
    const match = texto.replace(/picotinho,?\s*baixa?\s*/i, '').match(regexQuantidade);
    
    if (!match) {
      return "Não consegui entender a quantidade e produto. Tente: 'Picotinho, baixa 1 kg de banana'";
    }
    
    let quantidade = parseFloat(match[1].replace(',', '.'));
    let unidadeExtraida = match[2] ? match[2].toLowerCase() : null;
    const produtoNome = match[3].trim().toUpperCase();
    
    console.log(`📊 Extraído: ${quantidade} ${unidadeExtraida || 'sem unidade'} de ${produtoNome}`);
    
    // Buscar produto no estoque do usuário
    const { data: estoque, error: erroEstoque } = await supabase
      .from('estoque_app')
      .select('*')
      .eq('user_id', mensagem.usuario_id)
      .ilike('produto_nome', `%${produtoNome}%`)
      .maybeSingle();
    
    if (erroEstoque) {
      console.error('❌ Erro ao buscar estoque:', erroEstoque);
      return "Erro ao consultar estoque. Tente novamente.";
    }
    
    if (!estoque) {
      return `Produto "${produtoNome}" não encontrado no seu estoque.`;
    }
    
    // Converter unidades se necessário
    let quantidadeConvertida = quantidade;
    let unidadeFinal = unidadeExtraida;
    
    if (unidadeExtraida) {
      // Se foi especificada uma unidade na mensagem
      if (unidadeExtraida.match(/g|gramas?/)) {
        // Converter gramas para kg
        quantidadeConvertida = quantidade / 1000;
        unidadeFinal = 'g';
      } else if (unidadeExtraida.match(/kg|kilos?|quilos?/)) {
        // Manter como kg
        quantidadeConvertida = quantidade;
        unidadeFinal = 'kg';
      } else {
        // Usar a unidade especificada
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
    
    // Arredondar baseado na unidade de medida
    if (estoque.unidade_medida.toLowerCase().includes('kg') || estoque.unidade_medida.toLowerCase().includes('kilo')) {
      novaQuantidade = Math.round(novaQuantidade * 100) / 100; // 2 casas decimais
    } else {
      novaQuantidade = Math.round(novaQuantidade); // Número inteiro para unidades
    }
    
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
 * Função para formatar quantidade com casas decimais apropriadas
 */
function formatarQuantidade(quantidade: number, unidade: string): string {
  const unidadeLower = unidade.toLowerCase();
  
  if (unidadeLower.includes('kg') || unidadeLower.includes('kilo')) {
    // Para kg, mostrar no máximo 2 casas decimais
    return `${quantidade.toFixed(2).replace(/\.?0+$/, '')} Kg`;
  } else if (unidadeLower.includes('g') && !unidadeLower.includes('kg')) {
    // Para gramas, mostrar como inteiro
    return `${Math.round(quantidade)} g`;
  } else if (unidadeLower.includes('l') || unidadeLower.includes('litro')) {
    // Para litros, mostrar no máximo 2 casas decimais
    return `${quantidade.toFixed(2).replace(/\.?0+$/, '')} L`;
  } else if (unidadeLower.includes('ml')) {
    // Para ml, mostrar como inteiro
    return `${Math.round(quantidade)} ml`;
  } else {
    // Para unidades, mostrar como inteiro
    return `${Math.round(quantidade)} ${unidade === 'UN' ? 'unidades' : unidade}`;
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
      console.log(`📋 [SQL] Query: SELECT produto_nome, quantidade, unidade_medida FROM estoque_app WHERE user_id = '${mensagem.usuario_id}' AND produto_nome ILIKE '%${produto}%' LIMIT 1`);

      // Buscar no estoque
      const { data, error } = await supabase
        .from("estoque_app")
        .select("produto_nome, quantidade, unidade_medida")
        .eq("user_id", mensagem.usuario_id)
        .ilike("produto_nome", `%${produto}%`)
        .limit(1)
        .single();

      console.log(`📋 [STEP 6] Resultado do banco:`);
      console.log(`📋 [RESULT] Data:`, data);
      console.log(`📋 [RESULT] Error:`, error);

      if (error || !data) {
        console.log(`❌ [STEP 7] Produto não encontrado - retornando erro`);
        return "❌ Produto não encontrado no seu estoque.";
      }

      console.log(`✅ [STEP 8] Produto encontrado - preparando resposta`);
      const resposta = `✅ Você tem ${data.quantidade} ${data.unidade_medida} de ${data.produto_nome} em estoque.`;
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
 * Processar comando de adicionar produto
 */
async function processarAdicionarProduto(supabase: any, mensagem: any): Promise<string> {
  try {
    console.log('➕ Processando adicionar produto...');
    
    const texto = mensagem.conteudo.toLowerCase();
    const produtoTexto = texto.replace(/picotinho,?\s*adiciona?\s*/i, '').replace(/\s*(na\s+lista|no\s+estoque).*$/i, '').trim();
    
    if (!produtoTexto) {
      return "Não consegui identificar o produto. Tente: 'Picotinho, adiciona banana na lista'";
    }
    
    // Extrair quantidade se especificada
    const regexQuantidade = /(\d+(?:[.,]\d+)?)\s*(kg|g|l|ml|unidade|un|pacote)?\s*(?:de\s+)?(.+)/i;
    const match = produtoTexto.match(regexQuantidade);
    
    let quantidade = 1;
    let unidade = 'unidade';
    let produtoNome = produtoTexto.toUpperCase();
    
    if (match) {
      quantidade = parseFloat(match[1].replace(',', '.'));
      unidade = match[2] || 'unidade';
      produtoNome = match[3].trim().toUpperCase();
    }
    
    // Verificar se produto já existe
    const { data: existente, error: erroExistente } = await supabase
      .from('estoque_app')
      .select('*')
      .eq('user_id', mensagem.usuario_id)
      .eq('produto_nome', produtoNome)
      .maybeSingle();
    
    if (erroExistente) {
      console.error('❌ Erro ao verificar produto existente:', erroExistente);
      return "Erro ao verificar estoque. Tente novamente.";
    }
    
    if (existente) {
      // Atualizar quantidade existente
      const novaQuantidade = existente.quantidade + quantidade;
      
      await supabase
        .from('estoque_app')
        .update({
          quantidade: novaQuantidade,
          updated_at: new Date().toISOString()
        })
        .eq('id', existente.id);
        
      return `✅ Produto atualizado!\n\n📦 ${produtoNome}\n➕ Adicionado: ${quantidade} ${unidade}\n📊 Estoque total: ${novaQuantidade} ${existente.unidade_medida}`;
    } else {
      // Criar novo produto
      await supabase
        .from('estoque_app')
        .insert({
          user_id: mensagem.usuario_id,
          produto_nome: produtoNome,
          categoria: 'outros',
          quantidade: quantidade,
          unidade_medida: unidade
        });
        
      return `✅ Produto adicionado ao estoque!\n\n📦 ${produtoNome}\n📊 Quantidade: ${quantidade} ${unidade}`;
    }
    
  } catch (error) {
    console.error('❌ Erro ao adicionar produto:', error);
    return "Erro ao adicionar produto. Tente novamente.";
  }
}

/**
 * Enviar resposta via WhatsApp
 */
async function enviarRespostaWhatsApp(numeroDestino: string, mensagem: string): Promise<boolean> {
  try {
    console.log('📤 [ENVIO] Iniciando envio da resposta WhatsApp...');
    console.log(`📤 [ENVIO] Número destino: ${numeroDestino}`);
    console.log(`📤 [ENVIO] Mensagem: ${mensagem}`);
    
    const instanceUrl = Deno.env.get('WHATSAPP_INSTANCE_URL');
    const apiToken = Deno.env.get('WHATSAPP_API_TOKEN');
    const accountSecret = Deno.env.get('WHATSAPP_ACCOUNT_SECRET');
    
    console.log(`📤 [ENVIO] Instance URL: ${instanceUrl ? 'OK' : 'MISSING'}`);
    console.log(`📤 [ENVIO] API Token: ${apiToken ? 'OK' : 'MISSING'}`);
    
    if (!instanceUrl || !apiToken) {
      console.error('❌ [ENVIO] Configurações do WhatsApp não encontradas');
      return false;
    }
    
    const url = `${instanceUrl}/token/${apiToken}/send-text`;
    console.log(`📤 [ENVIO] URL completa: ${url}`);
    
    const payload = {
      phone: numeroDestino,
      message: mensagem
    };
    console.log(`📤 [ENVIO] Payload:`, JSON.stringify(payload));
    
    console.log('📤 [ENVIO] Fazendo requisição HTTP...');
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Client-Token': accountSecret
      },
      body: JSON.stringify(payload)
    });
    
    console.log(`📤 [ENVIO] Status da resposta: ${response.status}`);
    console.log(`📤 [ENVIO] Headers da resposta:`, JSON.stringify(Object.fromEntries(response.headers.entries())));
    
    const responseText = await response.text();
    console.log(`📤 [ENVIO] Corpo da resposta: ${responseText}`);
    
    if (response.ok) {
      console.log('✅ [ENVIO] Resposta enviada via WhatsApp com sucesso');
      return true;
    } else {
      console.error(`❌ [ENVIO] Erro HTTP ${response.status}:`, responseText);
      return false;
    }
    
  } catch (error) {
    console.error('❌ [ENVIO] Erro no envio WhatsApp:', error);
    console.error('❌ [ENVIO] Stack trace:', error.stack);
    return false;
  }
}

serve(handler);