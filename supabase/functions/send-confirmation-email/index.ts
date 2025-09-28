import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, nome, confirmationCode } = await req.json();

    // Aqui você integraria com seu provedor de email (SendGrid, AWS SES, etc.)
    console.log(`Enviando email de confirmação para ${email} (${nome}) - Código: ${confirmationCode}`);

    // Por enquanto, apenas simular o envio
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Email de confirmação enviado com sucesso" 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Erro ao enviar email:', error);
    return new Response(
      JSON.stringify({ 
        error: "Erro interno do servidor",
        details: error instanceof Error ? error.message : "Unknown error"
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});