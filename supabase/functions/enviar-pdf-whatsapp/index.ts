import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EnviarPDFRequest {
  pdf_base64: string;
  filename: string;
  telefone_id?: string; // ID do telefone específico (opcional)
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Authorization header required');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    // Verificar usuário autenticado
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      throw new Error('User not authenticated');
    }

    const { pdf_base64, filename, telefone_id }: EnviarPDFRequest = await req.json();

    if (!pdf_base64 || !filename) {
      throw new Error('PDF e filename são obrigatórios');
    }

    console.log(`📄 Enviando PDF "${filename}" para usuário ${user.id}`);

    // Buscar número verificado do usuário
    // Se telefone_id foi informado, usar esse específico
    // Caso contrário, usar o principal (comportamento padrão)
    let query = supabase
      .from('whatsapp_telefones_autorizados')
      .select('numero_whatsapp')
      .eq('usuario_id', user.id)
      .eq('verificado', true)
      .eq('ativo', true);

    if (telefone_id) {
      query = query.eq('id', telefone_id);
      console.log(`🎯 Usando telefone específico: ${telefone_id}`);
    } else {
      query = query.eq('tipo', 'principal');
      console.log('📱 Usando telefone principal');
    }

    const { data: telefone, error: telefoneError } = await query.maybeSingle();

    if (telefoneError || !telefone) {
      console.error('❌ Usuário sem número WhatsApp verificado');
      throw new Error('Configure e verifique seu número WhatsApp primeiro');
    }

    // Garantir prefixo 55 (Brasil) para envio via Z-API
    const numeroComPrefixo = telefone.numero_whatsapp.startsWith('55') 
      ? telefone.numero_whatsapp 
      : `55${telefone.numero_whatsapp}`;

    // Validar tamanho do PDF (limite Z-API ~5MB)
    const pdfSize = pdf_base64.length * 0.75 / 1024 / 1024; // Estimar tamanho em MB
    if (pdfSize > 5) {
      throw new Error('PDF muito grande. Limite: 5MB');
    }

    // Buscar credenciais WhatsApp
    const instanceUrl = Deno.env.get('WHATSAPP_INSTANCE_URL');
    const apiToken = Deno.env.get('WHATSAPP_API_TOKEN');
    const accountSecret = Deno.env.get('WHATSAPP_ACCOUNT_SECRET');

    console.log('🔍 Verificando credenciais WhatsApp:');
    console.log('- Instance URL:', instanceUrl ? 'OK' : 'FALTANDO');
    console.log('- API Token:', apiToken ? 'OK' : 'FALTANDO');
    console.log('- Account Secret:', accountSecret ? 'OK' : 'FALTANDO');

    if (!instanceUrl || !apiToken || !accountSecret) {
      throw new Error('Credenciais WhatsApp não configuradas');
    }

    // Enviar documento via Z-API
    const sendDocumentUrl = `${instanceUrl}/token/${apiToken}/send-document`;
    
    console.log(`📱 Enviando PDF para ${numeroComPrefixo}`);
    console.log(`📊 Tamanho estimado: ${pdfSize.toFixed(2)}MB`);

    const whatsappResponse = await fetch(sendDocumentUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Client-Token': accountSecret,
      },
      body: JSON.stringify({
        phone: numeroComPrefixo,
        document: `data:application/pdf;base64,${pdf_base64}`,
        filename: filename,
      }),
    });

    const whatsappResult = await whatsappResponse.json();
    console.log('📊 Status da resposta:', whatsappResponse.status);
    console.log('📦 Resposta Z-API:', JSON.stringify(whatsappResult));

    if (!whatsappResponse.ok) {
      console.error('❌ Erro ao enviar PDF via WhatsApp:', whatsappResult);
      throw new Error(`Falha no envio: ${whatsappResult?.error || 'Erro desconhecido'}`);
    }

    console.log('✅ PDF enviado com sucesso!');
    return new Response(JSON.stringify({ 
      success: true, 
      message: 'PDF enviado com sucesso para seu WhatsApp!'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });

  } catch (error) {
    console.error('💥 Erro na função enviar-pdf-whatsapp:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || 'Erro ao enviar PDF' 
      }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );
  }
};

serve(handler);
