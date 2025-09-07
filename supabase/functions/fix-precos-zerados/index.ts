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

    // Buscar todos os produtos de notas fiscais processadas que não estão em precos_atuais
    const { data: produtosSemPreco } = await supabase.rpc('sql', { 
      query: `
        WITH produtos_notas AS (
          SELECT DISTINCT
            UPPER(TRIM(
              REGEXP_REPLACE(
                REGEXP_REPLACE(
                  REGEXP_REPLACE(
                    item->>'descricao',
                    '\\b(PAO DE FORMA|PAO FORMA)\\s*(PULLMAN|PUSPANAT|WICKBOLD|PLUS|VITA)?\\s*\\d*G?\\s*(100\\s*NUTRICAO|INTEGRAL|10\\s*GRAOS|ORIGINAL)?\\b', 
                    'PAO DE FORMA', 'gi'
                  ),
                  '\\b(FATIADO|MINI\\s*LANCHE|170G\\s*AMEIXA|380G|450G|480G|500G|180G\\s*REQUEIJAO|3\\.0|INTEGRAL|10\\s*GRAOS|ORIGINAL|\\d+G|\\d+ML|\\d+L|\\d+KG)\\b', 
                  '', 'gi'
                ),
                '\\s+', ' ', 'g'
              )
            )) as produto_nome_normalizado,
            COALESCE((item->>'valor_unitario')::numeric, (item->>'preco_unitario')::numeric, 0) as valor_unitario,
            COALESCE(
              ni.dados_extraidos->'estabelecimento'->>'nome',
              ni.dados_extraidos->'supermercado'->>'nome', 
              ni.dados_extraidos->'emitente'->>'nome',
              'Estabelecimento'
            ) as estabelecimento_nome,
            COALESCE(
              REGEXP_REPLACE(ni.dados_extraidos->'estabelecimento'->>'cnpj', '[^\\d]', '', 'g'),
              REGEXP_REPLACE(ni.dados_extraidos->'supermercado'->>'cnpj', '[^\\d]', '', 'g'),
              REGEXP_REPLACE(ni.dados_extraidos->'emitente'->>'cnpj', '[^\\d]', '', 'g'),
              '00000000000000'
            ) as estabelecimento_cnpj,
            GREATEST(ni.created_at, now() - interval '30 days') as data_atualizacao
          FROM notas_imagens ni
          CROSS JOIN LATERAL jsonb_array_elements(ni.dados_extraidos->'itens') as item
          WHERE ni.processada = true 
            AND ni.dados_extraidos IS NOT NULL
            AND item->>'descricao' IS NOT NULL
            AND COALESCE((item->>'valor_unitario')::numeric, (item->>'preco_unitario')::numeric, 0) > 0
            AND LENGTH(TRIM(item->>'descricao')) > 2
        )
        SELECT 
          produto_nome_normalizado,
          valor_unitario,
          estabelecimento_nome,
          estabelecimento_cnpj,
          data_atualizacao,
          COUNT(*) as frequencia
        FROM produtos_notas pn
        WHERE NOT EXISTS (
          SELECT 1 FROM precos_atuais pa 
          WHERE pa.produto_nome = pn.produto_nome_normalizado
          AND pa.estabelecimento_cnpj = pn.estabelecimento_cnpj
        )
        AND produto_nome_normalizado IS NOT NULL 
        AND LENGTH(produto_nome_normalizado) > 2
        GROUP BY produto_nome_normalizado, valor_unitario, estabelecimento_nome, estabelecimento_cnpj, data_atualizacao
        ORDER BY frequencia DESC, produto_nome_normalizado
        LIMIT 50;
      `
    });

    console.log(`📊 Encontrados ${produtosSemPreco?.length || 0} produtos sem preço atual`);

    let produtosCorrigidos = 0;
    let erros = 0;

    // Processar cada produto individualmente para evitar conflitos
    for (const produto of produtosSemPreco || []) {
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
      totalEncontrados: produtosSemPreco?.length || 0
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