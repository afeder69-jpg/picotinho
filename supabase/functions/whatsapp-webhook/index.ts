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
    console.log('📱 WhatsApp Webhook recebido:', req.method);
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (req.method === 'GET') {
      const url = new URL(req.url);
      const hubChallenge = url.searchParams.get('hub.challenge');
      
      if (hubChallenge) {
        return new Response(hubChallenge, { 
          status: 200,
          headers: corsHeaders 
        });
      }
      
      return new Response('Webhook verification failed', { 
        status: 400,
        headers: corsHeaders 
      });
    }

    if (req.method === 'POST') {
      const webhookData = await req.json();
      
      console.log('📋 Dados recebidos:', JSON.stringify(webhookData, null, 2));
      
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

      // SEMPRE enviar resposta automática para qualquer número (independente de cadastro)
      try {
        console.log('🔧 INICIANDO ENVIO DE RESPOSTA AUTOMÁTICA');
        console.log('📱 Número destinatário:', remetente);
        
        const apiToken = Deno.env.get('WHATSAPP_API_TOKEN');
        console.log('🔑 Token existe?', apiToken ? 'SIM' : 'NÃO');
        console.log('🔑 Primeiros 6 chars do token:', apiToken ? apiToken.substring(0, 6) + '...' : 'N/A');
        
        if (!apiToken) {
          throw new Error('WHATSAPP_API_TOKEN não configurado');
        }
        
        const instanceId = '3E681FAD30EBC0315D8B4A19A3C36A1F';
        const sendTextUrl = `https://api.z-api.io/instances/${instanceId}/token/${apiToken}/send-text`;
        
        console.log('🔗 URL completa do envio:', sendTextUrl);
        
        const requestBody = {
          phone: remetente,
          message: 'Mensagem recebida pelo Picotinho ✅'
        };
        
        console.log('📦 Body da requisição:', JSON.stringify(requestBody, null, 2));
        
        const confirmacao = await fetch(sendTextUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Client-Token': apiToken
          },
          body: JSON.stringify(requestBody)
        });
        
        console.log('📊 Status HTTP recebido:', confirmacao.status);
        console.log('📊 Headers da resposta:', Object.fromEntries(confirmacao.headers.entries()));
        
        const responseText = await confirmacao.text();
        console.log('📝 Resposta completa da Z-API:', responseText);
        
        if (confirmacao.ok) {
          console.log('✅ Resposta automática enviada com sucesso');
        } else {
          console.error('❌ Erro ao enviar resposta automática. Status:', confirmacao.status, 'Body:', responseText);
        }
      } catch (error) {
        console.error('❌ Erro ao enviar resposta automática:', error);
      }

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