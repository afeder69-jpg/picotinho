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
    console.log('🚀 WEBHOOK CHAMADO - INÍCIO DA EXECUÇÃO');
    console.log('📱 WhatsApp Webhook recebido:', req.method);
    console.log('🕐 Timestamp:', new Date().toISOString());
    console.log('🔄 Versão da função: 5.0 - FORÇA REDEPLOY'); // Debug version
    
    // FIRST THING: Check ALL environment variables
    const allEnvs = Deno.env.toObject();
    console.log('🔍 TOTAL ENV VARS:', Object.keys(allEnvs).length);
    console.log('🔍 ENV KEYS SORTED:', JSON.stringify(Object.keys(allEnvs).sort(), null, 2));
    
    // Check specific secrets existence
    console.log('🔍 WHATSAPP_INSTANCE_URL:', Deno.env.get('WHATSAPP_INSTANCE_URL') ? 'EXISTS' : 'MISSING');
    console.log('🔍 WHATSAPP_API_TOKEN:', Deno.env.get('WHATSAPP_API_TOKEN') ? 'EXISTS' : 'MISSING');
    console.log('🔍 WHATSAPP_ACCOUNT_SECRET:', Deno.env.get('WHATSAPP_ACCOUNT_SECRET') ? 'EXISTS' : 'MISSING');
    console.log('🔍 SUPABASE_URL:', Deno.env.get('SUPABASE_URL') ? 'EXISTS' : 'MISSING');
    console.log('🔍 SUPABASE_SERVICE_ROLE_KEY:', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ? 'EXISTS' : 'MISSING');
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (req.method === 'GET') {
      console.log('🔧 GET REQUEST RECEBIDO - TESTE DE WEBHOOK');
      const url = new URL(req.url);
      const hubChallenge = url.searchParams.get('hub.challenge');
      
      console.log('🔍 URL completa:', req.url);
      console.log('🔍 Query params:', Object.fromEntries(url.searchParams.entries()));
      
      if (hubChallenge) {
        console.log('✅ Hub challenge encontrado:', hubChallenge);
        return new Response(hubChallenge, { 
          status: 200,
          headers: corsHeaders 
        });
      }
      
      // Resposta de teste para GET sem parâmetros
      console.log('📝 Respondendo com status de teste');
      return new Response('✅ Webhook Picotinho funcionando! Timestamp: ' + new Date().toISOString(), { 
        status: 200,
        headers: corsHeaders 
      });
    }

    if (req.method === 'POST') {
      const webhookData = await req.json();
      
      console.log('🔍 PAYLOAD COMPLETO RECEBIDO:');
      console.log(JSON.stringify(webhookData, null, 2));
      console.log('🔍 TIPO DE EVENTO:', webhookData.type);
      console.log('🔍 ESTRUTURA DO TEXTO:', webhookData.text ? JSON.stringify(webhookData.text, null, 2) : 'NÃO ENCONTRADO');
      console.log('🔍 CAMPO PHONE:', webhookData.phone);
      console.log('🔍 CAMPO MESSAGE:', webhookData.message);
      console.log('🔍 CAMPO FROM:', webhookData.from);
      console.log('🔍 TODAS AS CHAVES PRINCIPAIS:', Object.keys(webhookData));
      
      // Log para comparar com formato esperado
      console.log('📋 Comparação de formatos:');
      console.log('- webhookData.phone =', webhookData.phone);
      console.log('- webhookData.text.message =', webhookData.text?.message);
      console.log('- webhookData.message =', webhookData.message);
      console.log('- webhookData.text =', webhookData.text);
      
      // Processar mensagem Z-API
      let remetente = '';
      let conteudo = '';
      let comando_identificado = null;
      
      if (webhookData.phone && webhookData.text) {
        remetente = webhookData.phone.replace(/\D/g, '');
        conteudo = webhookData.text.message || '';
        
        if (conteudo.toLowerCase().includes('picotinho')) {
          if (conteudo.toLowerCase().includes('baixa')) {
            comando_identificado = 'baixar_estoque';
          } else if (conteudo.toLowerCase().includes('consulta')) {
            comando_identificado = 'consultar_estoque';
          } else if (conteudo.toLowerCase().includes('adiciona')) {
            comando_identificado = 'adicionar_produto';
          }
        }
      }
      
      if (!remetente || !conteudo) {
        return new Response('Formato não reconhecido', { 
          status: 400,
          headers: corsHeaders 
        });
      }
      
      // Buscar usuário
      const { data: usuario } = await supabase
        .from('whatsapp_configuracoes')
        .select('usuario_id')
        .eq('numero_whatsapp', remetente)
        .eq('ativo', true)
        .maybeSingle();
      
      // Salvar mensagem
      const { data: mensagemSalva, error } = await supabase
        .from('whatsapp_mensagens')
        .insert({
          usuario_id: usuario?.usuario_id || null,
          remetente,
          conteudo,
          tipo_mensagem: 'text',
          webhook_data: webhookData,
          comando_identificado,
          data_recebimento: new Date().toISOString()
        })
        .select()
        .single();

      if (error) {
        console.error('❌ Erro ao salvar:', error);
        throw error;
      }

      console.log('💾 Mensagem salva:', mensagemSalva.id);

      console.log('💾 Mensagem salva - aguardando processamento do comando se identificado');

      // Processar comando automaticamente se identificado e usuário existe
      if (comando_identificado && usuario?.usuario_id) {
        try {
          console.log('🤖 Processando comando automaticamente...');
          
          const response = await fetch(`${supabaseUrl}/functions/v1/process-whatsapp-command`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${supabaseServiceKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ messageId: mensagemSalva.id })
          });
          
          if (response.ok) {
            console.log('✅ Comando processado com sucesso');
          } else {
            console.error('❌ Erro ao processar comando:', await response.text());
          }
        } catch (error) {
          console.error('❌ Erro no processamento:', error);
        }
      }

      return new Response(JSON.stringify({
        ok: true,
        messageId: mensagemSalva.id
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response('Método não permitido', { 
      status: 405,
      headers: corsHeaders 
    });

  } catch (error: any) {
    console.error('❌ Erro:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
};

serve(handler);