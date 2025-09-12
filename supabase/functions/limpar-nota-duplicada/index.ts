import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { notaId, userId } = await req.json()

    console.log(`🗑️ Removendo nota duplicada: ${notaId} para usuário: ${userId}`)

    // 1. Verificar se a nota existe e pertence ao usuário
    const { data: nota, error: notaError } = await supabaseClient
      .from('notas_imagens')
      .select('*')
      .eq('id', notaId)
      .eq('usuario_id', userId)
      .single()

    if (notaError) {
      console.error('❌ Erro ao buscar nota:', notaError)
      return new Response(
        JSON.stringify({ error: 'Nota não encontrada' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      )
    }

    console.log('📋 Nota encontrada:', {
      id: nota.id,
      nome_original: nota.nome_original,
      processada: nota.processada,
      created_at: nota.created_at
    })

    // 2. Remover a nota da tabela notas_imagens
    const { error: deleteError } = await supabaseClient
      .from('notas_imagens')
      .delete()
      .eq('id', notaId)
      .eq('usuario_id', userId)

    if (deleteError) {
      console.error('❌ Erro ao deletar nota:', deleteError)
      return new Response(
        JSON.stringify({ error: 'Erro ao remover nota' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    // 3. Remover arquivo do storage se existir
    if (nota.imagem_path) {
      const { error: storageError } = await supabaseClient.storage
        .from('receipts')
        .remove([nota.imagem_path])
      
      if (storageError) {
        console.warn('⚠️ Aviso ao remover arquivo do storage:', storageError)
        // Não falhar se houver erro no storage
      } else {
        console.log('✅ Arquivo removido do storage:', nota.imagem_path)
      }
    }

    console.log('✅ Nota duplicada removida completamente')

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Nota duplicada removida com sucesso',
        notaRemovida: {
          id: nota.id,
          nome_original: nota.nome_original,
          created_at: nota.created_at
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('❌ Erro geral:', error)
    return new Response(
      JSON.stringify({ error: 'Erro interno do servidor' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})