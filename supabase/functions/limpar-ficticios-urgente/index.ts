import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase environment variables");
    }

    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.7.1");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('🚨 LIMPEZA URGENTE DE DADOS FICTÍCIOS INICIADA');

    // 1. IDENTIFICAR A NOTA FICTÍCIA ESPECÍFICA
    const notaFicticia = 'f06ffdb0-51c3-4725-b1ec-209bee62ff3f';
    
    console.log(`🎯 Limpando nota fictícia: ${notaFicticia}`);

    // 2. REMOVER ESTOQUE FICTÍCIO
    const { data: estoqueRemovido, error: erroEstoque } = await supabase
      .from('estoque_app')
      .delete()
      .eq('nota_id', notaFicticia);

    if (erroEstoque) {
      console.error('❌ Erro ao remover estoque:', erroEstoque);
    } else {
      console.log('✅ Estoque fictício removido');
    }

    // 3. MARCAR NOTA COMO NÃO PROCESSADA E LIMPAR DADOS
    const { data: notaLimpa, error: erroNota } = await supabase
      .from('notas_imagens')
      .update({
        processada: false,
        dados_extraidos: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', notaFicticia);

    if (erroNota) {
      console.error('❌ Erro ao limpar nota:', erroNota);
    } else {
      console.log('✅ Nota fictícia limpa');
    }

    // 4. BUSCAR E LIMPAR OUTRAS NOTAS SUSPEITAS
    const { data: outrasNotas, error: erroConsulta } = await supabase
      .from('notas_imagens')
      .select('id, dados_extraidos')
      .eq('processada', true)
      .not('dados_extraidos', 'is', null);

    let outras_limpas = 0;

    if (outrasNotas) {
      for (const nota of outrasNotas) {
        const dados = nota.dados_extraidos as any;
        const nomeEstab = dados?.estabelecimento?.nome || '';
        const cnpjEstab = dados?.estabelecimento?.cnpj || '';

        // Verificar se é fictícia
        if (
          nomeEstab.includes('EXEMPLO') ||
          nomeEstab.includes('TESTE') ||
          cnpjEstab === '12345678000190' ||
          cnpjEstab === '12.345.678/0001-90'
        ) {
          console.log(`🧹 Limpando nota suspeita: ${nota.id}`);
          
          // Remover estoque
          await supabase
            .from('estoque_app')
            .delete()
            .eq('nota_id', nota.id);

          // Limpar nota
          await supabase
            .from('notas_imagens')
            .update({
              processada: false,
              dados_extraidos: null,
              updated_at: new Date().toISOString()
            })
            .eq('id', nota.id);

          outras_limpas++;
        }
      }
    }

    console.log('✅ LIMPEZA URGENTE CONCLUÍDA');

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Dados fictícios removidos com sucesso',
        nota_principal_limpa: notaFicticia,
        outras_notas_limpas: outras_limpas,
        timestamp: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error('❌ Erro na limpeza urgente:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Erro desconhecido'
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});