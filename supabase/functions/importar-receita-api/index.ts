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
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Não autenticado');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new Error('Usuário não autenticado');
    }

    const { receita } = await req.json();
    
    if (!receita || !receita.titulo) {
      throw new Error('Dados da receita inválidos');
    }

    console.log(`📥 Importando receita: ${receita.titulo}`);

    // 1. Criar a receita
    const { data: receitaCriada, error: receitaError } = await supabase
      .from('receitas')
      .insert({
        user_id: user.id,
        titulo: receita.titulo,
        descricao: receita.descricao,
        instrucoes: receita.instrucoes || '',
        tempo_preparo: receita.tempo_preparo,
        porcoes: receita.porcoes,
        imagem_url: receita.imagem_url,
        api_source_id: receita.api_source_id,
        api_source_name: receita.api_source_name,
        fonte: 'api_externa',
        status: 'ativa',
        publica: false,
      })
      .select()
      .single();

    if (receitaError) throw receitaError;

    console.log(`✅ Receita criada: ${receitaCriada.id}`);

    // 2. Adicionar ingredientes
    if (receita.ingredientes && receita.ingredientes.length > 0) {
      const ingredientesParaInserir = receita.ingredientes.map((ing: any) => ({
        receita_id: receitaCriada.id,
        ingrediente: ing.ingrediente,
        quantidade: ing.quantidade || null,
        unidade_medida: ing.unidade_medida || 'un',
        opcional: false,
      }));

      const { error: ingredientesError } = await supabase
        .from('receita_ingredientes')
        .insert(ingredientesParaInserir);

      if (ingredientesError) {
        console.error('⚠️ Erro ao inserir ingredientes:', ingredientesError);
      } else {
        console.log(`✅ ${ingredientesParaInserir.length} ingredientes adicionados`);
      }
    }

    // 3. Adicionar tags se existirem
    if (receita.tags && receita.tags.length > 0) {
      const tagsParaInserir = receita.tags.map((tag: string) => ({
        receita_id: receitaCriada.id,
        tag: tag.toLowerCase().trim(),
      }));

      const { error: tagsError } = await supabase
        .from('receitas_tags')
        .insert(tagsParaInserir);

      if (tagsError) {
        console.error('⚠️ Erro ao inserir tags:', tagsError);
      } else {
        console.log(`✅ ${tagsParaInserir.length} tags adicionadas`);
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        receita: receitaCriada,
        message: 'Receita importada com sucesso!'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Erro ao importar receita:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
