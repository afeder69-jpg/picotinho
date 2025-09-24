import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🔧 Processando correção de comando WhatsApp...');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Buscar a mensagem "Aumenta 1kg de alho" não processada
    const { data: mensagem, error: erroMensagem } = await supabase
      .from('whatsapp_mensagens')
      .select('*')
      .eq('conteudo', 'Aumenta 1kg de alho')
      .eq('processada', false)
      .order('data_recebimento', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (erroMensagem || !mensagem) {
      console.error('❌ Mensagem não encontrada:', erroMensagem);
      return new Response('Mensagem não encontrada', { status: 404, headers: corsHeaders });
    }

    console.log('📨 Processando mensagem:', mensagem.conteudo);

    // Processar comando de aumentar estoque
    let resposta = "Olá! Sou o Picotinho 🤖\n\n";
    
    const produto = "alho";
    const quantidade = 1;
    const unidade = "kg";

    // Buscar produto no estoque
    const { data: estoque, error: erroEstoque } = await supabase
      .from('estoque_app')
      .select('*')
      .eq('user_id', mensagem.usuario_id)
      .ilike('produto_nome', `%${produto}%`)
      .maybeSingle();

    if (erroEstoque) {
      console.error('❌ Erro ao buscar estoque:', erroEstoque);
      resposta += "Erro ao consultar estoque. Tente novamente.";
    } else if (!estoque) {
      resposta += `❌ Produto "${produto}" não encontrado no seu estoque. Use o comando 'adicionar' para incluir um novo produto.`;
    } else {
      // Converter kg para a unidade do estoque se necessário
      let quantidadeConvertida = quantidade;
      if (unidade === "kg" && estoque.unidade_medida.toLowerCase().includes('g') && !estoque.unidade_medida.toLowerCase().includes('kg')) {
        quantidadeConvertida = quantidade * 1000; // 1 kg = 1000 g
      }

      // Somar ao estoque existente
      const novaQuantidade = estoque.quantidade + quantidadeConvertida;

      // Atualizar estoque
      await supabase
        .from('estoque_app')
        .update({
          quantidade: novaQuantidade,
          updated_at: new Date().toISOString()
        })
        .eq('id', estoque.id);

      resposta += `✅ Foram adicionados ${quantidade} ${unidade} ao estoque de ${estoque.produto_nome}. Agora você tem ${novaQuantidade} ${estoque.unidade_medida} em estoque.`;
    }

    // Enviar resposta via WhatsApp
    const instanceUrl = Deno.env.get('WHATSAPP_INSTANCE_URL');
    const token = Deno.env.get('WHATSAPP_API_TOKEN');
    const accountSecret = Deno.env.get('WHATSAPP_ACCOUNT_SECRET');

    if (!instanceUrl || !token || !accountSecret) {
      console.error('❌ Variáveis WhatsApp não configuradas');
      return new Response('Erro na configuração WhatsApp', { status: 500, headers: corsHeaders });
    }

    const whatsappUrl = `${instanceUrl}/send-text`;
    const whatsappPayload = {
      phone: mensagem.remetente,
      message: resposta
    };

    console.log('📤 Enviando resposta WhatsApp:', resposta);

    const whatsappResponse = await fetch(whatsappUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Client-Token': token,
        'Account-Secret': accountSecret
      },
      body: JSON.stringify(whatsappPayload)
    });

    if (whatsappResponse.ok) {
      console.log('✅ Resposta enviada com sucesso');
      
      // Marcar mensagem como processada
      await supabase
        .from('whatsapp_mensagens')
        .update({
          processada: true,
          resposta_enviada: resposta,
          comando_identificado: 'aumentar_estoque',
          data_processamento: new Date().toISOString()
        })
        .eq('id', mensagem.id);

      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Comando processado e resposta enviada',
        resposta 
      }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } else {
      console.error('❌ Erro ao enviar WhatsApp:', await whatsappResponse.text());
      return new Response('Erro ao enviar WhatsApp', { status: 500, headers: corsHeaders });
    }

  } catch (error: any) {
    console.error('❌ Erro geral:', error);
    return new Response(`Erro: ${error instanceof Error ? error.message : String(error)}`, { status: 500, headers: corsHeaders });
  }
};

serve(handler);