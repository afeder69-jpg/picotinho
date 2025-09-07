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

    console.log('🔧 Iniciando correção GLOBAL de preços zerados...');

    // Buscar TODOS os produtos de notas fiscais processadas que não estão em precos_atuais
    const { data: produtosSemPreco } = await supabase
      .from('notas_imagens')
      .select('dados_extraidos, created_at')
      .eq('processada', true)
      .not('dados_extraidos', 'is', null);

    console.log(`📋 Processando ${produtosSemPreco?.length || 0} notas fiscais`);

    const produtosFaltantes = [];
    
    for (const nota of produtosSemPreco || []) {
      if (!nota.dados_extraidos?.itens) continue;
      
      const estabelecimentoNome = nota.dados_extraidos.estabelecimento?.nome || 
                                  nota.dados_extraidos.supermercado?.nome || 
                                  nota.dados_extraidos.emitente?.nome || 
                                  'Estabelecimento';
      
      const estabelecimentoCnpj = (nota.dados_extraidos.estabelecimento?.cnpj || 
                                   nota.dados_extraidos.supermercado?.cnpj || 
                                   nota.dados_extraidos.emitente?.cnpj || 
                                   '00000000000000').replace(/[^\d]/g, '');
      
      for (const item of nota.dados_extraidos.itens) {
        if (!item.descricao || !item.valor_unitario || item.valor_unitario <= 0) continue;
        
        // Normalizar nome do produto
        let produtoNormalizado = item.descricao.toUpperCase().trim();
        produtoNormalizado = produtoNormalizado
          .replace(/\b(PAO DE FORMA|PAO FORMA)\s*(PULLMAN|PUSPANAT|WICKBOLD|PLUS|VITA)?\s*\d*G?\s*(100\s*NUTRICAO|INTEGRAL|10\s*GRAOS|ORIGINAL)?\b/gi, 'PAO DE FORMA')
          .replace(/\b(FATIADO|MINI\s*LANCHE|170G\s*AMEIXA|380G|450G|480G|500G|180G\s*REQUEIJAO|3\.0|INTEGRAL|10\s*GRAOS|ORIGINAL|\d+G|\d+ML|\d+L|\d+KG)\b/gi, '')
          .replace(/\s+/g, ' ')
          .trim();
        
        if (produtoNormalizado.length <= 2) continue;
        
        // Verificar se já existe
        const { data: jaExiste } = await supabase
          .from('precos_atuais')
          .select('id')
          .eq('produto_nome', produtoNormalizado)
          .eq('estabelecimento_cnpj', estabelecimentoCnpj)
          .single();
        
        if (!jaExiste) {
          produtosFaltantes.push({
            produto_nome_normalizado: produtoNormalizado,
            valor_unitario: parseFloat(item.valor_unitario),
            estabelecimento_nome: estabelecimentoNome,
            estabelecimento_cnpj: estabelecimentoCnpj,
            data_atualizacao: nota.created_at
          });
        }
      }
    }

    console.log(`📊 Encontrados ${produtosFaltantes.length} produtos sem preço atual`);

    let produtosCorrigidos = 0;
    let erros = 0;

    // Processar cada produto faltante individualmente para evitar conflitos
    for (const produto of produtosFaltantes) {
      try {
        const { error: insertError } = await supabase
          .from('precos_atuais')
          .upsert({
            produto_nome: produto.produto_nome_normalizado,
            valor_unitario: produto.valor_unitario,
            estabelecimento_nome: produto.estabelecimento_nome,
            estabelecimento_cnpj: produto.estabelecimento_cnpj,
            data_atualizacao: produto.data_atualizacao
          }, {
            onConflict: 'produto_nome,estabelecimento_cnpj'
          });

        if (insertError) {
          console.error(`❌ Erro ao inserir ${produto.produto_nome_normalizado}:`, insertError);
          erros++;
        } else {
          console.log(`✅ Preço corrigido: ${produto.produto_nome_normalizado} - R$ ${produto.valor_unitario}`);
          produtosCorrigidos++;
        }
      } catch (produtoError) {
        console.error(`❌ Erro no produto ${produto.produto_nome_normalizado}:`, produtoError);
        erros++;
      }
    }

    console.log(`🎯 Correção concluída: ${produtosCorrigidos} produtos corrigidos, ${erros} erros`);

    return new Response(JSON.stringify({
      success: true,
      message: `Correção de preços concluída`,
      produtosCorrigidos,
      erros,
      totalEncontrados: produtosFaltantes.length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Erro ao corrigir preços zerados:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});