import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RecategorizationRule {
  keywords: string[];
  targetCategory: string;
  sourceCategories?: string[]; // Se especificado, só recategoriza desses
  description: string;
}

const regrasRecategorizacao: RecategorizationRule[] = [
  // LATICÍNIOS/FRIOS → MERCEARIA
  {
    keywords: ['leite condensado', 'condensado'],
    targetCategory: 'MERCEARIA',
    sourceCategories: ['LATICÍNIOS', 'LATICÍNIOS/FRIOS', 'FRIOS E LATICÍNIOS'],
    description: 'Leite condensado deve ser mercearia'
  },
  {
    keywords: ['chocolate garoto', 'chocolate'],
    targetCategory: 'MERCEARIA',
    sourceCategories: ['LATICÍNIOS', 'LATICÍNIOS/FRIOS', 'FRIOS E LATICÍNIOS', 'OUTROS'],
    description: 'Chocolate deve ser mercearia'
  },
  {
    keywords: ['creme de leite', 'creme leite'],
    targetCategory: 'MERCEARIA',
    sourceCategories: ['LATICÍNIOS', 'LATICÍNIOS/FRIOS', 'FRIOS E LATICÍNIOS'],
    description: 'Creme de leite deve ser mercearia'
  },
  
  // → PADARIA
  {
    keywords: ['manteiga'],
    targetCategory: 'PADARIA',
    sourceCategories: ['LATICÍNIOS', 'LATICÍNIOS/FRIOS', 'FRIOS E LATICÍNIOS', 'OUTROS'],
    description: 'Manteiga deve ser padaria'
  },
  
  // OUTROS → MERCEARIA
  {
    keywords: ['geleia'],
    targetCategory: 'MERCEARIA',
    sourceCategories: ['OUTROS'],
    description: 'Geleia deve ser mercearia'
  },
  {
    keywords: ['gelatina'],
    targetCategory: 'MERCEARIA',
    sourceCategories: ['OUTROS'],
    description: 'Gelatina deve ser mercearia'
  },
  {
    keywords: ['goiabada'],
    targetCategory: 'MERCEARIA',
    sourceCategories: ['OUTROS'],
    description: 'Goiabada deve ser mercearia'
  },
  {
    keywords: ['flocão', 'granfino'],
    targetCategory: 'MERCEARIA',
    sourceCategories: ['OUTROS'],
    description: 'Flocão deve ser mercearia'
  },
  
  // OUTROS → HORTIFRUTI
  {
    keywords: ['abacate'],
    targetCategory: 'HORTIFRUTI',
    sourceCategories: ['OUTROS'],
    description: 'Abacate deve ser hortifruti'
  },
  {
    keywords: ['mamão formosa', 'mamão'],
    targetCategory: 'HORTIFRUTI',
    sourceCategories: ['OUTROS'],
    description: 'Mamão deve ser hortifruti'
  },
  {
    keywords: ['rúcula', 'rucula'],
    targetCategory: 'HORTIFRUTI',
    sourceCategories: ['OUTROS'],
    description: 'Rúcula deve ser hortifruti'
  },
  
  // OUTROS → BEBIDAS
  {
    keywords: ['chá pronto', 'mate leão', 'chá mate', 'cha pronto', 'cha mate'],
    targetCategory: 'BEBIDAS',
    sourceCategories: ['OUTROS'],
    description: 'Chá pronto deve ser bebidas'
  }
];

interface Mudanca {
  produto_nome: string;
  categoria_anterior: string;
  categoria_nova: string;
  razao: string;
  status: 'sucesso' | 'erro';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('🔍 Iniciando recategorização inteligente de produtos...');

    // Buscar todos os produtos do estoque
    const { data: produtos, error: produtosError } = await supabase
      .from('estoque_app')
      .select('id, produto_nome, categoria, user_id');

    if (produtosError) {
      throw new Error(`Erro ao buscar produtos: ${produtosError.message}`);
    }

    console.log(`📦 Total de produtos encontrados: ${produtos?.length || 0}`);

    const mudancas: Mudanca[] = [];
    let produtosRecategorizados = 0;
    let produtosAnalisados = 0;

    for (const produto of produtos || []) {
      produtosAnalisados++;
      const nomeLower = produto.produto_nome.toLowerCase();
      const categoriaAtual = produto.categoria.toUpperCase();

      // Verificar cada regra
      for (const regra of regrasRecategorizacao) {
        // Verificar se alguma keyword match
        const matchKeyword = regra.keywords.some(keyword => 
          nomeLower.includes(keyword.toLowerCase())
        );

        if (!matchKeyword) continue;

        // Verificar se precisa recategorizar
        const categoriaAlvo = regra.targetCategory.toUpperCase();
        
        // Se já está na categoria correta, pular
        if (categoriaAtual === categoriaAlvo) {
          console.log(`✅ ${produto.produto_nome} já está em ${categoriaAlvo}`);
          continue;
        }

        // Se há restrição de categoria origem, verificar
        if (regra.sourceCategories && regra.sourceCategories.length > 0) {
          const categoriaOrigemMatch = regra.sourceCategories.some(cat => 
            categoriaAtual.includes(cat.toUpperCase()) || cat.toUpperCase().includes(categoriaAtual)
          );
          
          if (!categoriaOrigemMatch) {
            console.log(`⏭️ ${produto.produto_nome} está em ${categoriaAtual}, mas regra só aplica para ${regra.sourceCategories.join(', ')}`);
            continue;
          }
        }

        // Recategorizar
        console.log(`🔄 Recategorizando: ${produto.produto_nome}`);
        console.log(`   De: ${categoriaAtual} → Para: ${categoriaAlvo}`);

        const { error: updateError } = await supabase
          .from('estoque_app')
          .update({ 
            categoria: categoriaAlvo,
            updated_at: new Date().toISOString()
          })
          .eq('id', produto.id);

        if (updateError) {
          console.error(`❌ Erro ao atualizar ${produto.produto_nome}:`, updateError.message);
          mudancas.push({
            produto_nome: produto.produto_nome,
            categoria_anterior: categoriaAtual,
            categoria_nova: categoriaAlvo,
            razao: regra.description,
            status: 'erro'
          });
        } else {
          console.log(`✅ Produto recategorizado: ${produto.produto_nome}`);
          produtosRecategorizados++;
          mudancas.push({
            produto_nome: produto.produto_nome,
            categoria_anterior: categoriaAtual,
            categoria_nova: categoriaAlvo,
            razao: regra.description,
            status: 'sucesso'
          });
        }

        // Só aplicar a primeira regra que fizer match
        break;
      }
    }

    const resultado = {
      sucesso: true,
      produtos_analisados: produtosAnalisados,
      produtos_recategorizados: produtosRecategorizados,
      produtos_mantidos: produtosAnalisados - produtosRecategorizados,
      mudancas: mudancas,
      timestamp: new Date().toISOString()
    };

    console.log('📊 Resultado da recategorização:');
    console.log(`   Total analisado: ${resultado.produtos_analisados}`);
    console.log(`   Recategorizados: ${resultado.produtos_recategorizados}`);
    console.log(`   Mantidos: ${resultado.produtos_mantidos}`);

    return new Response(JSON.stringify(resultado), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    });

  } catch (error) {
    console.error('❌ Erro na recategorização:', error);
    return new Response(
      JSON.stringify({
        sucesso: false,
        erro: error.message,
        timestamp: new Date().toISOString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
