import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const { produtos, userId, latitude, longitude, raioKm } = await req.json()

    console.log(`🔍 Buscando preços de outros usuários para ${produtos.length} produtos`)
    console.log(`📍 Usuário: ${userId}, Coordenadas: ${latitude}, ${longitude}, Raio: ${raioKm}km`)

    const resultados: any[] = []

    for (const produtoNome of produtos) {
      console.log(`🔍 Processando produto: ${produtoNome}`)

      let menorPrecoArea = null

      // Buscar na tabela precos_atuais (preços de outros usuários/estabelecimentos)
      // Como estamos buscando da tabela geral precos_atuais, vamos buscar o mais recente
      const { data: precosArea } = await supabase
        .from('precos_atuais')
        .select('*')
        .or(`produto_nome.ilike.%${produtoNome}%,produto_nome_normalizado.ilike.%${produtoNome}%`)
        .order('data_atualizacao', { ascending: false })
        .limit(1)

      if (precosArea && precosArea.length > 0) {
        const preco = precosArea[0]
        menorPrecoArea = {
          data: preco.data_atualizacao,
          preco: preco.valor_unitario,
          estabelecimento: preco.estabelecimento_nome,
          quantidade: 1
        }
        console.log(`✅ Encontrou preço mais recente: R$ ${preco.valor_unitario} em ${preco.estabelecimento_nome} em ${preco.data_atualizacao}`)
      }

      // Buscar última compra do próprio usuário para comparação
      let ultimaCompraUsuario = null
      const { data: notasUsuario } = await supabase
        .from('notas_imagens')
        .select('dados_extraidos, created_at')
        .eq('usuario_id', userId)
        .eq('processada', true)
        .not('dados_extraidos', 'is', null)
        .order('created_at', { ascending: false })

      for (const nota of notasUsuario || []) {
        const itens = nota.dados_extraidos?.itens || []
        for (const item of itens) {
          const descricao = item.descricao || ''
          if (descricao.toLowerCase().includes(produtoNome.toLowerCase()) || 
              produtoNome.toLowerCase().includes(descricao.toLowerCase())) {
            ultimaCompraUsuario = {
              data: nota.created_at,
              preco: parseFloat(item.valor_unitario || 0),
              quantidade: parseFloat(item.quantidade || 1)
            }
            console.log(`✅ Encontrou última compra do usuário: R$ ${ultimaCompraUsuario.preco}`)
            break
          }
        }
        if (ultimaCompraUsuario) break
      }

      resultados.push({
        produto: produtoNome,
        ultimaCompraUsuario,
        menorPrecoArea
      })
    }

    console.log(`✅ Processamento concluído: ${resultados.length} produtos`)

    return new Response(
      JSON.stringify({ 
        success: true, 
        resultados 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    console.error('❌ Erro na função:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})

function calcularDistancia(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
  return R * c
}