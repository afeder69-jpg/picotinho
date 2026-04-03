import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { feedback_id, mensagem, autor_id } = await req.json();

    if (!feedback_id || !mensagem) {
      return new Response(JSON.stringify({ error: 'feedback_id e mensagem são obrigatórios' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Buscar feedback e telefone do usuário
    const { data: feedback, error: feedbackError } = await supabase
      .from('feedbacks')
      .select('id, user_id, telefone_whatsapp, status, tipo, mensagem')
      .eq('id', feedback_id)
      .single();

    if (feedbackError || !feedback) {
      return new Response(JSON.stringify({ error: 'Feedback não encontrado' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!feedback.telefone_whatsapp) {
      return new Response(JSON.stringify({ error: 'Feedback sem telefone WhatsApp associado' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Tentar enviar via Z-API
    const instanceUrl = Deno.env.get('WHATSAPP_INSTANCE_URL');
    const apiToken = Deno.env.get('WHATSAPP_API_TOKEN');
    const accountSecret = Deno.env.get('WHATSAPP_ACCOUNT_SECRET');

    let envioStatus: 'enviado' | 'falha' = 'falha';
    let envioErro: string | null = null;

    if (!instanceUrl || !apiToken) {
      envioErro = 'Credenciais WhatsApp não configuradas';
      console.error('❌ [FEEDBACK-RESPOSTA] Credenciais WhatsApp ausentes');
    } else {
      try {
        const sendTextUrl = `${instanceUrl}/token/${apiToken}/send-text`;
        const prefixo = '📬 *Resposta do Picotinho:*\n\n';
        const response = await fetch(sendTextUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(accountSecret ? { 'Client-Token': accountSecret } : {})
          },
          body: JSON.stringify({
            phone: feedback.telefone_whatsapp,
            message: prefixo + mensagem,
            delayTyping: 3
          })
        });

        if (response.ok) {
          envioStatus = 'enviado';
          console.log(`✅ [FEEDBACK-RESPOSTA] Mensagem enviada para ${feedback.telefone_whatsapp}`);
        } else {
          const errorBody = await response.text();
          envioErro = `HTTP ${response.status}: ${errorBody}`;
          console.error(`❌ [FEEDBACK-RESPOSTA] Falha Z-API: ${envioErro}`);
        }
      } catch (err: any) {
        envioErro = err.message;
        console.error(`❌ [FEEDBACK-RESPOSTA] Exceção: ${envioErro}`);
      }
    }

    // Inserir resposta no histórico
    const { error: insertError } = await supabase
      .from('feedbacks_respostas')
      .insert({
        feedback_id,
        autor_id: autor_id || null,
        autor_tipo: 'master',
        mensagem,
        enviada_via_whatsapp: true,
        envio_whatsapp_status: envioStatus,
        envio_whatsapp_erro: envioErro
      });

    if (insertError) {
      console.error('❌ [FEEDBACK-RESPOSTA] Erro ao inserir resposta:', insertError);
      return new Response(JSON.stringify({ error: 'Erro ao registrar resposta', details: insertError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Só atualizar status do feedback se envio foi bem-sucedido
    if (envioStatus === 'enviado') {
      await supabase
        .from('feedbacks')
        .update({ status: 'respondido', updated_at: new Date().toISOString() })
        .eq('id', feedback_id);
    }

    return new Response(JSON.stringify({
      ok: true,
      envio_status: envioStatus,
      envio_erro: envioErro
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('❌ [FEEDBACK-RESPOSTA] Erro:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
