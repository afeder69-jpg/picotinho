import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Mapeamento de palavras-chave para categorias
const CATEGORIAS_MAP: Record<string, string[]> = {
  'Sobremesas': ['bolo', 'torta', 'doce', 'mousse', 'pudim', 'brownie', 'cookie', 'sorvete', 'pavê', 'brigadeiro'],
  'Massas': ['massa', 'macarrão', 'lasanha', 'espaguete', 'nhoque', 'talharim', 'penne', 'ravióli'],
  'Carnes': ['carne', 'bife', 'churrasco', 'picanha', 'costela', 'frango', 'galinha', 'peru', 'bacon'],
  'Peixes e Frutos do Mar': ['peixe', 'salmão', 'atum', 'bacalhau', 'camarão', 'lagosta', 'polvo', 'lula', 'marisco'],
  'Sopas e Caldos': ['sopa', 'caldo', 'consomê', 'creme'],
  'Saladas': ['salada', 'alface', 'rúcula', 'tomate'],
  'Lanches': ['sanduíche', 'hambúrguer', 'cachorro-quente', 'pizza', 'empada', 'pastel', 'coxinha'],
  'Bebidas': ['suco', 'vitamina', 'smoothie', 'café', 'chá', 'coquetel', 'bebida'],
  'Pães': ['pão', 'pãozinho', 'baguete', 'ciabatta', 'brioche'],
  'Arroz e Grãos': ['arroz', 'feijão', 'lentilha', 'grão', 'risoto'],
  'Vegetarianos': ['vegetariano', 'vegano', 'legume', 'verdura'],
  'Acompanhamentos': ['acompanhamento', 'guarnição', 'molho', 'farofa']
};

// Extrair categoria baseada no título e ingredientes
function extrairCategoria(titulo: string, ingredientes: string[]): string {
  const tituloLower = titulo.toLowerCase();
  const ingredientesTexto = ingredientes.join(' ').toLowerCase();
  const textoCompleto = `${tituloLower} ${ingredientesTexto}`;
  
  for (const [categoria, palavrasChave] of Object.entries(CATEGORIAS_MAP)) {
    if (palavrasChave.some(palavra => textoCompleto.includes(palavra))) {
      return categoria;
    }
  }
  
  return 'Diversos';
}

// Extrair tags do título
function extrairTags(titulo: string, categoria: string): string[] {
  const tags: string[] = [];
  const tituloLower = titulo.toLowerCase();
  
  // Tags de tipo de preparo
  if (tituloLower.includes('frito') || tituloLower.includes('fritura')) tags.push('Frito');
  if (tituloLower.includes('assado')) tags.push('Assado');
  if (tituloLower.includes('grelhado')) tags.push('Grelhado');
  if (tituloLower.includes('cozido')) tags.push('Cozido');
  
  // Tags de características
  if (tituloLower.includes('light') || tituloLower.includes('diet')) tags.push('Light');
  if (tituloLower.includes('vegano')) tags.push('Vegano');
  if (tituloLower.includes('vegetariano')) tags.push('Vegetariano');
  if (tituloLower.includes('integral')) tags.push('Integral');
  if (tituloLower.includes('sem glúten') || tituloLower.includes('gluten free')) tags.push('Sem Glúten');
  
  // Tags de origem
  if (tituloLower.includes('brasil') || tituloLower.includes('mineiro') || tituloLower.includes('baiano')) {
    tags.push('Brasileira');
  }
  if (tituloLower.includes('italiano') || tituloLower.includes('itália')) tags.push('Italiana');
  if (tituloLower.includes('japonês') || tituloLower.includes('japão')) tags.push('Japonesa');
  if (tituloLower.includes('chinês') || tituloLower.includes('china')) tags.push('Chinesa');
  if (tituloLower.includes('francês') || tituloLower.includes('frança')) tags.push('Francesa');
  if (tituloLower.includes('mexicano') || tituloLower.includes('méxico')) tags.push('Mexicana');
  
  // Adicionar categoria como tag
  if (categoria !== 'Diversos') {
    tags.push(categoria);
  }
  
  return [...new Set(tags)]; // Remover duplicatas
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🚀 Iniciando geração de categorias e tags...');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Buscar todas as receitas
    const { data: receitas, error: errorReceitas } = await supabase
      .from('receitas_publicas_brasileiras')
      .select('id, titulo, ingredientes, categoria, tags');

    if (errorReceitas) {
      throw errorReceitas;
    }

    console.log(`📊 Total de receitas a processar: ${receitas.length}`);

    let processadas = 0;
    let erros = 0;

    // Processar em lotes
    const BATCH_SIZE = 50;
    for (let i = 0; i < receitas.length; i += BATCH_SIZE) {
      const batch = receitas.slice(i, i + BATCH_SIZE);
      
      for (const receita of batch) {
        try {
          // Extrair ingredientes como array de strings
          const ingredientes = Array.isArray(receita.ingredientes) 
            ? receita.ingredientes.map((ing: any) => 
                typeof ing === 'string' ? ing : (ing.nome || ing.name || '')
              ).filter((ing: string) => ing.trim())
            : [];

          // Gerar categoria
          const novaCategoria = extrairCategoria(receita.titulo, ingredientes);
          
          // Gerar tags
          const novasTags = extrairTags(receita.titulo, novaCategoria);

          // Atualizar receita
          const { error: errorUpdate } = await supabase
            .from('receitas_publicas_brasileiras')
            .update({
              categoria: novaCategoria,
              tags: novasTags
            })
            .eq('id', receita.id);

          if (errorUpdate) {
            console.error(`❌ Erro ao atualizar receita ${receita.titulo}:`, errorUpdate);
            erros++;
          } else {
            processadas++;
            if (processadas % 100 === 0) {
              console.log(`✅ ${processadas} receitas processadas...`);
            }
          }
        } catch (error) {
          console.error(`❌ Erro ao processar receita ${receita.titulo}:`, error);
          erros++;
        }
      }
    }

    console.log(`🎉 Processamento concluído!`);
    console.log(`   - Processadas: ${processadas}`);
    console.log(`   - Erros: ${erros}`);

    return new Response(
      JSON.stringify({ 
        success: true,
        processadas,
        erros,
        message: `${processadas} receitas atualizadas com categorias e tags!`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Erro ao gerar categorias e tags:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
