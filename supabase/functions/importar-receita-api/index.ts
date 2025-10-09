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

    console.log('👤 Usuário autenticado:', user.id);

    const receitaData = await req.json();
    
    console.log('📦 Dados recebidos:', {
      titulo: receitaData.titulo,
      id: receitaData.id,
      fonte: receitaData.fonte
    });

    // Verificar se receita já existe (evitar duplicação)
    const { data: existente } = await supabase
      .from('receitas')
      .select('id')
      .eq('user_id', user.id)
      .eq('titulo', receitaData.titulo)
      .maybeSingle();

    if (existente) {
      console.log('⚠️ Receita já importada:', existente.id);
      return new Response(
        JSON.stringify({ 
          message: 'Receita já foi importada anteriormente',
          receita_id: existente.id,
          duplicada: true
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // Criar a receita
    const { data: receitaCriada, error: receitaError } = await supabase
      .from('receitas')
      .insert({
        user_id: user.id,
        titulo: receitaData.titulo,
        descricao: receitaData.descricao || receitaData.modo_preparo,
        modo_preparo: receitaData.modo_preparo || receitaData.descricao,
        instrucoes: receitaData.modo_preparo || receitaData.descricao || receitaData.instrucoes || 'Instruções não disponíveis',
        tempo_preparo: receitaData.tempo_preparo,
        porcoes: (() => {
          let porcoes = receitaData.porcoes || receitaData.rendimento;
          if (typeof porcoes === 'string') {
            const match = porcoes.match(/\d+/);
            return match ? parseInt(match[0]) : null;
          }
          return porcoes;
        })(),
        imagem_url: receitaData.imagem_url,
        categoria: receitaData.categoria,
        fonte: receitaData.fonte === 'afrodite-json' ? 'brasileiras' : (receitaData.fonte || 'api_externa'),
        status: 'publicada',
        publica: false,
      })
      .select()
      .single();

    if (receitaError) throw receitaError;

    console.log(`✅ Receita criada: ${receitaCriada.id}`);

    // Adicionar ingredientes
    if (receitaData.ingredientes && receitaData.ingredientes.length > 0) {
      const ingredientesParaInserir = receitaData.ingredientes.map((ing: any) => ({
        receita_id: receitaCriada.id,
        produto_nome_busca: ing.nome || ing.ingrediente || ing,
        quantidade: ing.quantidade?.toString() || ing.quantity?.toString() || '1',
        unidade_medida: ing.unidade || ing.unidade_medida || ing.unit || 'un',
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

    // Adicionar tags se existirem
    if (receitaData.tags && receitaData.tags.length > 0) {
      const tagsParaInserir = receitaData.tags.map((tag: string) => ({
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
