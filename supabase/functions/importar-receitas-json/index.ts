import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🚀 Iniciando importação de receitas brasileiras do GitHub...');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // URL do repositório afrodite.json no GitHub (maior livro de receitas em português)
    const RECEITAS_JSON_URL = 'https://raw.githubusercontent.com/adrianosferreira/afrodite.json/master/afrodite.json';

    console.log('📥 Fazendo download do JSON do GitHub...');
    const response = await fetch(RECEITAS_JSON_URL);
    
    if (!response.ok) {
      throw new Error(`Erro ao baixar receitas: ${response.statusText}`);
    }

    const receitasArray = await response.json();
    console.log(`📊 Total de receitas no arquivo: ${receitasArray.length}`);

    // Verificar quantas receitas já existem no banco
    const { count: existingCount } = await supabase
      .from('receitas_publicas_brasileiras')
      .select('*', { count: 'exact', head: true });

    console.log(`📌 Receitas já importadas: ${existingCount || 0}`);

    if (existingCount && existingCount > 0) {
      return new Response(
        JSON.stringify({ 
          message: 'Receitas já foram importadas anteriormente',
          total_banco: existingCount,
          importacao_ja_realizada: true
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // Processar e inserir receitas em lotes
    const BATCH_SIZE = 100;
    let totalImportadas = 0;
    let totalErros = 0;

    for (let i = 0; i < receitasArray.length; i += BATCH_SIZE) {
      const batch = receitasArray.slice(i, i + BATCH_SIZE);
      
      const receitasParaInserir = batch.map((receita: any) => ({
        titulo: receita.titulo || receita.name || 'Sem título',
        categoria: receita.categoria || receita.category || 'Diversos',
        modo_preparo: receita.preparo || receita.method || receita.modo_preparo || '',
        ingredientes: Array.isArray(receita.ingredientes) 
          ? receita.ingredientes 
          : (Array.isArray(receita.ingredients) ? receita.ingredients : []),
        tempo_preparo: receita.tempo || receita.preparationTime || receita.tempo_preparo || null,
        rendimento: receita.rendimento || receita.portions || receita.porcoes || null,
        imagem_url: receita.imagem || receita.image || receita.imagem_url || null,
        tags: Array.isArray(receita.tags) ? receita.tags : [],
        fonte: 'afrodite-json',
      }));

      const { data, error } = await supabase
        .from('receitas_publicas_brasileiras')
        .insert(receitasParaInserir)
        .select();

      if (error) {
        console.error(`❌ Erro no lote ${i}-${i + BATCH_SIZE}:`, error);
        totalErros += batch.length;
      } else {
        totalImportadas += data.length;
        console.log(`✅ Lote ${i}-${i + BATCH_SIZE} importado: ${data.length} receitas`);
      }
    }

    console.log(`🎉 Importação concluída!`);
    console.log(`   - Total importadas: ${totalImportadas}`);
    console.log(`   - Total com erro: ${totalErros}`);

    return new Response(
      JSON.stringify({ 
        success: true,
        total_receitas_arquivo: receitasArray.length,
        total_importadas: totalImportadas,
        total_erros: totalErros,
        message: `${totalImportadas} receitas brasileiras importadas com sucesso!`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Erro ao importar receitas:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
