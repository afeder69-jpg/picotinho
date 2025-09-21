// supabase/functions/process-receipt-full/index.ts

import { createClient } from '@supabase/supabase-js'
import { Database } from '../../types/supabase'

const supabase = createClient<Database>(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// 🚀 Categorias oficiais (fixas, não cria mais nada além dessas)
const CATEGORIAS_FIXAS = [
  'HORTIFRUTI',
  'BEBIDAS',
  'MERCEARIA',
  'AÇOUGUE',
  'PADARIA',
  'LATICÍNIOS/FRIOS',
  'LIMPEZA',
  'HIGIENE/FARMÁCIA',
  'CONGELADOS',
  'PET',
  'OUTROS'
]

/**
 * Normaliza a categoria retornada pela IA
 * - Transforma em maiúsculas
 * - Remove acentos
 * - Se não bater em nenhuma das 11 oficiais → manda para "OUTROS"
 */
function normalizarCategoria(categoriaIA: string): string {
  if (!categoriaIA) return 'OUTROS'

  const cat = categoriaIA.trim().toUpperCase()

  const encontrada = CATEGORIAS_FIXAS.find(c =>
    c.normalize('NFD').replace(/[\u0300-\u036f]/g, '') ===
    cat.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  )

  return encontrada ?? 'OUTROS'
}

// Função principal que processa a nota inteira
export async function processReceiptFull(notaId: string) {
  try {
    // 🔎 Buscar os dados da nota já extraídos (tabela notas_imagens)
    const { data: notaImagem, error: erroNota } = await supabase
      .from('notas_imagens')
      .select('dados_extraidos')
      .eq('id', notaId)
      .single()

    if (erroNota || !notaImagem) throw new Error('Nota não encontrada')

    const dados = notaImagem.dados_extraidos

    // 🛒 Iterar pelos itens da nota
    for (const item of dados.itens) {
      const categoriaNormalizada = normalizarCategoria(item.categoria)

      const { error: erroProduto } = await supabase
        .from('produtos_app')
        .insert({
          produto_nome: item.descricao,
          categoria: categoriaNormalizada,
          quantidade: item.quantidade,
          unidade_medida: item.unidade,
          preco_unitario_ultimo: item.valor_unitario,
          created_at: new Date().toISOString(),
        })

      if (erroProduto) {
        console.error('❌ Erro ao inserir produto:', erroProduto)
      }
    }

    console.log('✅ Nota processada com sucesso')
  } catch (err) {
    console.error('❌ Erro no processamento da nota:', err)
    throw err
  }
}
