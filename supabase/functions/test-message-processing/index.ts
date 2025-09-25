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
    console.log('🧪 [TESTE] Iniciando teste de processamento...');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Buscar uma mensagem com "-" não processada
    const { data: mensagem, error: erroMensagem } = await supabase
      .from('whatsapp_mensagens')
      .select('*')
      .like('conteudo', '-%')
      .eq('processada', false)
      .order('data_recebimento', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (erroMensagem || !mensagem) {
      console.error('❌ [TESTE] Mensagem não encontrada:', erroMensagem);
      return new Response('Mensagem não encontrada', { status: 404, headers: corsHeaders });
    }

    console.log('📨 [TESTE] Processando mensagem:', mensagem.conteudo);

    const conteudo = mensagem.conteudo.toLowerCase().trim();
    console.log('🔍 [TESTE] Conteúdo normalizado:', conteudo);

    // Teste dos regex
    const temSinalMenos = conteudo.startsWith('-');
    console.log('➖ [TESTE] Tem sinal menos?', temSinalMenos);

    const regexReduzir = /^-\s*(\d+(?:[,.]\d+)?)\s*(kg|g|l|ml|un|unidade|unidades|litro|litros|grama|gramas|quilograma|quilogramas|quilo|quilos)\s+(?:de\s+)?(.+)$/i;
    const matchReduzir = conteudo.match(regexReduzir);
    console.log('🔍 [TESTE] Match regex reduzir:', matchReduzir);

    if (matchReduzir) {
      const quantidade = parseFloat(matchReduzir[1].replace(',', '.'));
      const unidade = matchReduzir[2];
      const produto = matchReduzir[3];
      
      console.log('✅ [TESTE] Comando reduzir identificado:', { quantidade, unidade, produto });
      
      return new Response(JSON.stringify({ 
        success: true, 
        tipo: 'reduzir',
        dados: { quantidade, unidade, produto },
        mensagem: mensagem.conteudo
      }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } else {
      console.log('❌ [TESTE] Comando não reconhecido');
      
      return new Response(JSON.stringify({ 
        success: false, 
        erro: 'Comando não reconhecido',
        conteudo: mensagem.conteudo,
        temSinalMenos,
        matchReduzir
      }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

  } catch (error) {
    console.error('❌ [TESTE] Erro geral:', error);
    return new Response(`Erro: ${error instanceof Error ? error.message : String(error)}`, { status: 500, headers: corsHeaders });
  }
};

serve(handler);