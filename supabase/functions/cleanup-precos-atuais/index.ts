import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Obter o usuário da requisição
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization header missing' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extrair o usuário do token
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token or user not found' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = user.id;
    console.log(`🧹 Iniciando limpeza completa de preços atuais para usuário: ${userId}`);

    // 1. Deletar todos os preços atuais relacionados às notas do usuário
    const { data: notasUsuario } = await supabase
      .from('notas_imagens')
      .select('dados_extraidos')
      .eq('usuario_id', userId)
      .eq('processada', true)
      .not('dados_extraidos', 'is', null);

    let cnpjsUsuario = new Set();
    
    if (notasUsuario) {
      for (const nota of notasUsuario) {
        const dados = nota.dados_extraidos;
        let cnpj = '';
        
        if (dados.cnpj) cnpj = dados.cnpj;
        else if (dados.estabelecimento?.cnpj) cnpj = dados.estabelecimento.cnpj;
        else if (dados.supermercado?.cnpj) cnpj = dados.supermercado.cnpj;
        else if (dados.emitente?.cnpj) cnpj = dados.emitente.cnpj;
        
        if (cnpj) {
          cnpjsUsuario.add(cnpj.replace(/[^\d]/g, ""));
        }
      }
    }

    let totalDeletados = 0;

    // Deletar preços atuais relacionados aos CNPJs do usuário
    for (const cnpj of cnpjsUsuario) {
      const { data: deletedPrecos, error: deleteError } = await supabase
        .from('precos_atuais')
        .delete()
        .eq('estabelecimento_cnpj', cnpj)
        .select('id');

      if (deleteError) {
        console.error(`Erro ao deletar preços do CNPJ ${cnpj}:`, deleteError);
      } else if (deletedPrecos) {
        totalDeletados += deletedPrecos.length;
        console.log(`✅ Deletados ${deletedPrecos.length} preços do CNPJ: ${cnpj}`);
      }
    }

    // 2. Deletar todos os preços atuais do usuário (tabela específica por usuário)
    const { data: deletedPrecosUsuario, error: deletePrecosUsuarioError } = await supabase
      .from('precos_atuais_usuario')
      .delete()
      .eq('user_id', userId)
      .select('id');

    if (deletePrecosUsuarioError) {
      console.error('Erro ao deletar preços do usuário:', deletePrecosUsuarioError);
    } else if (deletedPrecosUsuario) {
      console.log(`✅ Deletados ${deletedPrecosUsuario.length} preços específicos do usuário`);
    }

    console.log(`🎯 Limpeza concluída: ${totalDeletados} registros de preços atuais deletados`);

    return new Response(
      JSON.stringify({ 
        success: true,
        totalPrecosAtuaisDeletados: totalDeletados,
        precosUsuarioDeletados: deletedPrecosUsuario?.length || 0,
        cnpjsProcessados: Array.from(cnpjsUsuario),
        message: 'Limpeza completa realizada com sucesso!'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Erro geral:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});