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
    const authHeader = req.headers.get('Authorization')!;
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new Error('Não autenticado');
    }

    const { userId, origem, titulo, receitaId, cardapioId, produtosManuais } = await req.json();

    if (!userId || !origem) {
      throw new Error('userId e origem são obrigatórios');
    }

    let produtos: Array<{ produto_nome: string; quantidade: number; unidade_medida: string }> = [];
    let tituloFinal = titulo || 'Nova Lista';

    // ORIGEM: RECEITA
    if (origem === 'receita' && receitaId) {
      const { data: receita, error: receitaError } = await supabase
        .from('receitas')
        .select('titulo, porcoes')
        .eq('id', receitaId)
        .single();

      if (receitaError) throw receitaError;

      const { data: ingredientes, error: ingredientesError } = await supabase
        .from('receita_ingredientes')
        .select('produto_nome, quantidade, unidade_medida')
        .eq('receita_id', receitaId);

      if (ingredientesError) throw ingredientesError;

      produtos = ingredientes || [];
      tituloFinal = titulo || `Lista: ${receita.titulo}`;
    }

    // ORIGEM: CARDÁPIO
    else if (origem === 'cardapio' && cardapioId) {
      const { data: cardapio, error: cardapioError } = await supabase
        .from('cardapios')
        .select('titulo')
        .eq('id', cardapioId)
        .single();

      if (cardapioError) throw cardapioError;

      const { data: cardapioReceitas, error: cardapioReceitasError } = await supabase
        .from('cardapio_receitas')
        .select('receita_id')
        .eq('cardapio_id', cardapioId);

      if (cardapioReceitasError) throw cardapioReceitasError;

      const receitasIds = [...new Set(cardapioReceitas.map(r => r.receita_id))];

      const ingredientesPromises = receitasIds.map(async (rId) => {
        const { data } = await supabase
          .from('receita_ingredientes')
          .select('produto_nome, quantidade, unidade_medida')
          .eq('receita_id', rId);
        return data || [];
      });

      const todasIngredientes = await Promise.all(ingredientesPromises);
      const ingredientesFlat = todasIngredientes.flat();

      // Consolidar ingredientes repetidos
      const produtosMap = new Map<string, { quantidade: number; unidade_medida: string }>();
      
      ingredientesFlat.forEach(ing => {
        const key = ing.produto_nome.toUpperCase();
        if (produtosMap.has(key)) {
          const existente = produtosMap.get(key)!;
          existente.quantidade += ing.quantidade;
        } else {
          produtosMap.set(key, {
            quantidade: ing.quantidade,
            unidade_medida: ing.unidade_medida
          });
        }
      });

      produtos = Array.from(produtosMap.entries()).map(([nome, dados]) => ({
        produto_nome: nome,
        quantidade: dados.quantidade,
        unidade_medida: dados.unidade_medida
      }));

      tituloFinal = titulo || `Lista: ${cardapio.titulo}`;
    }

    // ORIGEM: MANUAL
    else if (origem === 'manual' && produtosManuais) {
      produtos = produtosManuais;
    }

    if (produtos.length === 0) {
      throw new Error('Nenhum produto encontrado para criar lista');
    }

    // Inserir lista
    const { data: lista, error: listaError } = await supabase
      .from('listas_compras')
      .insert({
        user_id: userId,
        titulo: tituloFinal,
        origem,
        receita_id: receitaId || null,
        cardapio_id: cardapioId || null
      })
      .select()
      .single();

    if (listaError) throw listaError;

    // Inserir itens
    const itens = produtos.map(p => ({
      lista_id: lista.id,
      produto_nome: p.produto_nome,
      quantidade: p.quantidade,
      unidade_medida: p.unidade_medida,
      comprado: false
    }));

    const { error: itensError } = await supabase
      .from('listas_compras_itens')
      .insert(itens);

    if (itensError) throw itensError;

    return new Response(
      JSON.stringify({
        listaId: lista.id,
        titulo: lista.titulo,
        produtos,
        origem
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Erro:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});