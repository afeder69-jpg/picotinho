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
      let anexoInfo = null;
      
      if (webhookData.phone && (webhookData.text || webhookData.document || webhookData.image)) {
        remetente = webhookData.phone.replace(/\D/g, '');
        conteudo = webhookData.text?.message || '';
        
        // Verificar se há anexo (documento ou imagem)
        if (webhookData.document) {
          anexoInfo = {
            tipo: 'document',
            url: webhookData.document.downloadUrl || webhookData.document.url,
            filename: webhookData.document.filename || 'documento.pdf',
            mimetype: webhookData.document.mimetype
          };
          comando_identificado = 'inserir_nota';
          // Se não há texto mas há documento, definir conteúdo padrão
          if (!conteudo) {
            conteudo = `[DOCUMENTO] ${anexoInfo.filename}`;
          }
          console.log('📎 Documento detectado:', anexoInfo);
        } else if (webhookData.image) {
          anexoInfo = {
            tipo: 'image',
            url: webhookData.image.downloadUrl || webhookData.image.url,
            filename: webhookData.image.filename || 'imagem.jpg',
            mimetype: webhookData.image.mimetype
          };
          comando_identificado = 'inserir_nota';
          // Se não há texto mas há imagem, definir conteúdo padrão
          if (!conteudo) {
            conteudo = `[IMAGEM] ${anexoInfo.filename}`;
          }
          console.log('🖼️ Imagem detectada:', anexoInfo);
        }
        
        // Normalizar o texto para reconhecimento de comando
        const textoLimpo = conteudo.toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '') // Remove acentos
          .replace(/[,\.\!\?]/g, ' ') // Remove pontuação específica
          .replace(/\s+/g, ' ') // Normaliza espaços
          .trim();
        
        console.log('🔍 Texto limpo para análise:', textoLimpo);
        console.log('🔍 Inicia com "-"?', textoLimpo.startsWith('-'));
        console.log('🔍 Inicia com "+"?', textoLimpo.startsWith('+'));
        
        // Identificar comando baseado em palavras-chave E símbolos (só se não há anexo)
        if (!anexoInfo) {
          if (textoLimpo.startsWith('-') || textoLimpo.match(/\b(baixa|baixar|diminui|diminuir|remove|remover)\b/)) {
            comando_identificado = 'baixar_estoque';
          } else if (textoLimpo.startsWith('+') || textoLimpo.match(/\b(aumenta|aumentar|soma|somar|adiciona quantidade|adicionar quantidade|acrescenta|acrescentar)\b/)) {
            comando_identificado = 'aumentar_estoque';
          } else if (textoLimpo.match(/\b(consulta|consultar|consulte|mostra|mostrar|ver|verificar)\b/)) {
            comando_identificado = 'consultar_estoque';
          } else if (textoLimpo.match(/\b(inclui|incluir|cria|criar|cadastra|cadastrar|adiciona|adicionar|add|novo produto|criar produto)\b/)) {
            comando_identificado = 'adicionar_produto';
          } else if (textoLimpo.match(/\b(inserir nota|inserir notas|enviar nota|enviar notas|nota fiscal|notas fiscais)\b/)) {
            comando_identificado = 'solicitar_nota';
          }
        }
        
        console.log('🎯 Comando identificado:', comando_identificado);
      }
      
      // Validar remetente (obrigatório) e conteúdo (obrigatório exceto para anexos)
      if (!remetente || (!conteudo && !anexoInfo)) {
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
          tipo_mensagem: anexoInfo ? anexoInfo.tipo : 'text',
          webhook_data: webhookData,
          comando_identificado,
          anexo_info: anexoInfo,
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

      // Verificar se usuário está cadastrado
      if (!usuario?.usuario_id) {
        console.log('📝 Número não cadastrado - ignorando mensagem');
        return new Response(JSON.stringify({
          ok: true,
          messageId: mensagemSalva.id,
          action: 'ignored_unregistered'
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Verificar se há sessões ativas antes de processar comando ou enviar erro
      let deveProcessar = false;
      let motivoProcessamento = '';
      
      if (comando_identificado) {
        deveProcessar = true;
        motivoProcessamento = `comando identificado: ${comando_identificado}`;
      } else {
        // Verificar se há sessão ativa para QUALQUER tipo de resposta (não só números)
        console.log(`🔍 Verificando se há sessão ativa para qualquer resposta...`);
        
        // Buscar sessões ativas para o usuário
        const { data: sessaoAtiva } = await supabase
          .from('whatsapp_sessions')
          .select('*')
          .eq('usuario_id', usuario.usuario_id)
          .eq('remetente', remetente)
          .gt('expires_at', new Date().toISOString())
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
          
        if (sessaoAtiva) {
          console.log(`🎯 Sessão ativa encontrada: ${sessaoAtiva.estado} - forçando processamento para qualquer resposta`);
          deveProcessar = true;
          motivoProcessamento = `resposta em sessão ativa: ${sessaoAtiva.estado}`;
        } else {
          // Verificar se é número simples para casos especiais
          const isNumeroSimples = /^\s*\d+([,.]\d+)?\s*$/.test(conteudo);
          console.log(`🔢 [DEBUG WEBHOOK] Testando "${conteudo}" com regex decimal: ${isNumeroSimples}`);
          
          if (isNumeroSimples) {
            console.log(`🔢 Número simples sem sessão ativa: "${conteudo}"`);
          }
        }
      }

      // Processar comando automaticamente se identificado OU se há sessão ativa
      if (deveProcessar) {
        try {
          console.log(`🤖 Processando comando automaticamente... (${motivoProcessamento})`);
          
          const response = await supabase.functions.invoke('process-whatsapp-command', {
            body: { messageId: mensagemSalva.id }
          });
          
          if (response.error) {
            console.error('❌ Erro ao processar comando:', response.error);
          } else {
            console.log('✅ Comando processado com sucesso:', response.data);
          }
        } catch (error) {
          console.error('❌ Erro no processamento:', error);
        }
      } else {
        // Comando não reconhecido E sem sessão ativa - enviar mensagem de erro amigável
        try {
          console.log('❌ Comando não reconhecido - enviando mensagem de erro');
          
          const instanceUrl = Deno.env.get('WHATSAPP_INSTANCE_URL');
          const apiToken = Deno.env.get('WHATSAPP_API_TOKEN');
          const accountSecret = Deno.env.get('WHATSAPP_ACCOUNT_SECRET');
          
          if (instanceUrl && apiToken) {
            const sendTextUrl = `${instanceUrl}/token/${apiToken}/send-text`;
            
            const requestBody = {
              phone: remetente,
              message: "👋 Olá, eu sou o Picotinho, seu assistente de compras!\nEscolha uma das opções para começar:\n- Consulta [produto]\n- Consulta Categoria [Nome da Categoria]\n- Incluir [produto]\n- Aumentar [quantidade] [produto]\n- Baixar [quantidade] [produto]\n- Inserir Nota (envie arquivo da nota fiscal)"
            };
            
            const errorResponse = await fetch(sendTextUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Client-Token': accountSecret
              },
              body: JSON.stringify(requestBody)
            });
            
            if (errorResponse.ok) {
              console.log('✅ Mensagem de erro enviada com sucesso');
              
              // Atualizar mensagem com resposta enviada
              await supabase
                .from('whatsapp_mensagens')
                .update({ resposta_enviada: requestBody.message })
                .eq('id', mensagemSalva.id);
            } else {
              console.error('❌ Erro ao enviar mensagem de erro:', await errorResponse.text());
            }
          }
        } catch (error) {
          console.error('❌ Erro ao enviar mensagem de erro:', error);
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