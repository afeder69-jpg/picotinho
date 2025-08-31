import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🧪 TESTE DIRETO DO WEBHOOK - Simulando mensagem Z-API');
    
    // Simular dados que o Z-API enviaria
    const testData = {
      text: "Picotinho, baixa do estoque 1kg de banana",
      phone: "21970016024",
      fromMe: false,
      timestamp: Date.now()
    };

    console.log('📨 Dados de teste:', JSON.stringify(testData, null, 2));

    // Criar cliente Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Processar mensagem como se fosse real
    const processedMessage = {
      remetente: testData.phone,
      conteudo: testData.text,
      tipo_mensagem: 'text',
      comando_identificado: testData.text.toLowerCase().includes('picotinho') && testData.text.toLowerCase().includes('baixa') ? 'baixar_estoque' : null,
      webhook_data: testData,
      data_recebimento: new Date().toISOString()
    };

    console.log('📝 Mensagem processada:', JSON.stringify(processedMessage, null, 2));

    // Inserir na tabela
    const { data, error } = await supabase
      .from('whatsapp_mensagens')
      .insert(processedMessage)
      .select();

    if (error) {
      console.error('❌ Erro ao inserir:', error);
      throw error;
    }

    console.log('✅ Mensagem inserida com sucesso:', data);

    return new Response(JSON.stringify({
      success: true,
      message: 'Teste do webhook executado com sucesso',
      data: data,
      processedMessage
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('💥 Erro no teste:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      stack: error.stack
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});