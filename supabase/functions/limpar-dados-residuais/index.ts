import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

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

    const { userId } = await req.json();
    
    if (!userId) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'userId é obrigatório' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`🧹 Iniciando limpeza de dados residuais para usuário ${userId}`);

    // 1. Buscar todos os CNPJs das notas fiscais do usuário
    const { data: notasUsuario, error: notasError } = await supabase
      .from('notas_imagens')
      .select('dados_extraidos')
      .eq('usuario_id', userId)
      .eq('processada', true)
      .not('dados_extraidos', 'is', null);

    if (notasError) {
      throw notasError;
    }

    const cnpjsValidos = new Set<string>();
    
    for (const nota of notasUsuario || []) {
      const dados = nota.dados_extraidos;
      if (!dados) continue;

      // Extrair CNPJ da nota
      let cnpjNota = "";
      if (dados.cnpj) cnpjNota = dados.cnpj;
      else if (dados.estabelecimento?.cnpj) cnpjNota = dados.estabelecimento.cnpj;
      else if (dados.supermercado?.cnpj) cnpjNota = dados.supermercado.cnpj;
      else if (dados.emitente?.cnpj) cnpjNota = dados.emitente.cnpj;
      
      const cnpjLimpo = (cnpjNota || "").replace(/[^\d]/g, "");
      if (cnpjLimpo) {
        cnpjsValidos.add(cnpjLimpo);
      }
    }

    console.log(`📝 CNPJs válidos encontrados: ${Array.from(cnpjsValidos).join(', ')}`);

    // 2. Remover preços residuais específicos do SUPERDELLI (dados de teste)
    const { data: precosSuperdelli, error: precosError } = await supabase
      .from('precos_atuais')
      .select('id, produto_nome, estabelecimento_nome, data_atualizacao')
      .eq('estabelecimento_nome', 'SUPERDELLI ATACADO E SUPERMERCADOS SA');

    if (precosError) {
      throw precosError;
    }

    let precosRemovidosCount = 0;

    // Remover apenas os preços do SUPERDELLI que são claramente residuais (data 11/09/2025)
    if (precosSuperdelli && precosSuperdelli.length > 0) {
      const idsParaRemover = precosSuperdelli
        .filter(p => p.data_atualizacao.includes('2025-09-11'))
        .map(p => p.id);

      if (idsParaRemover.length > 0) {
        const { error: deleteError } = await supabase
          .from('precos_atuais')
          .delete()
          .in('id', idsParaRemover);

        if (deleteError) {
          throw deleteError;
        }

        precosRemovidosCount = idsParaRemover.length;
        console.log(`✅ Removidos ${precosRemovidosCount} preços residuais do SUPERDELLI`);
      }
    }

    // 3. Não precisamos verificar precos_atuais_usuario pois o problema específico é nos preços gerais

    return new Response(JSON.stringify({
      success: true,
      message: 'Limpeza de dados residuais concluída',
      detalhes: {
        cnpjsValidos: Array.from(cnpjsValidos),
        precosResiduaisRemovidos: precosRemovidosCount
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('❌ Erro na limpeza:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});