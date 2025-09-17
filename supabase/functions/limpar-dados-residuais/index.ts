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

    // 2. Buscar todos os preços na tabela precos_atuais que NÃO correspondem a estabelecimentos das notas do usuário
    const { data: precosResiduais, error: precosError } = await supabase
      .from('precos_atuais')
      .select('*');

    if (precosError) {
      throw precosError;
    }

    let precosRemovidosCount = 0;
    const precosParaRemover: string[] = [];

    for (const preco of precosResiduais || []) {
      const cnpjPreco = (preco.estabelecimento_cnpj || "").replace(/[^\d]/g, "");
      
      // Se o CNPJ do preço não está nas notas do usuário, é residual
      if (cnpjPreco && !cnpjsValidos.has(cnpjPreco)) {
        precosParaRemover.push(preco.id);
        console.log(`🗑️ Preço residual: ${preco.produto_nome} - ${preco.estabelecimento_nome} (CNPJ: ${cnpjPreco})`);
      }
    }

    // 3. Remover preços residuais
    if (precosParaRemover.length > 0) {
      const { error: deleteError } = await supabase
        .from('precos_atuais')
        .delete()
        .in('id', precosParaRemover);

      if (deleteError) {
        throw deleteError;
      }

      precosRemovidosCount = precosParaRemover.length;
      console.log(`✅ Removidos ${precosRemovidosCount} preços residuais`);
    }

    // 4. Verificar se há preços do usuário com datas inconsistentes
    const { data: precosUsuario, error: precosUsuarioError } = await supabase
      .from('precos_atuais_usuario')
      .select('*')
      .eq('user_id', userId);

    if (precosUsuarioError) {
      throw precosUsuarioError;
    }

    let precosUsuarioCorrigidos = 0;
    for (const preco of precosUsuario || []) {
      // Verificar se a data é muito antiga ou no futuro
      const dataPreco = new Date(preco.data_atualizacao);
      const hoje = new Date();
      const umMesAtras = new Date();
      umMesAtras.setMonth(hoje.getMonth() - 1);

      if (dataPreco < umMesAtras || dataPreco > hoje) {
        // Corrigir data para hoje
        const { error: updateError } = await supabase
          .from('precos_atuais_usuario')
          .update({ data_atualizacao: hoje.toISOString() })
          .eq('id', preco.id);

        if (!updateError) {
          precosUsuarioCorrigidos++;
          console.log(`📅 Data corrigida para: ${preco.produto_nome}`);
        }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Limpeza de dados residuais concluída',
      detalhes: {
        cnpjsValidos: Array.from(cnpjsValidos),
        precosResiduaisRemovidos: precosRemovidosCount,
        precosUsuarioCorrigidos: precosUsuarioCorrigidos
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