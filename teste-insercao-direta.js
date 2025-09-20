// ============= FUNÇÃO DE TESTE PARA INSERÇÃO DIRETA =============
// Esta função recebe o JSON do cupom e insere direto no estoque_app
// SEM passar por nenhuma outra etapa - para teste determinístico

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mjsbwrtegorjxcepvrik.supabase.co';
const supabaseServiceKey = 'YOUR_SERVICE_KEY_HERE'; // Usar service_role key
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// JSON EXATO da IA-2 (o "dado-verdade")
const jsonCupomCostazul = {
  "itens": [
    {"categoria": "Outros", "codigo": "19793", "descricao": "Tempero Verde", "quantidade": 3, "unidade": "Unidade", "valor_total": 10.47, "valor_unitario": 3.49},
    {"categoria": "Outros", "codigo": "28062", "descricao": "Milho Verde Predilecta 170g Lata", "quantidade": 1, "unidade": "Unidade", "valor_total": 3.59, "valor_unitario": 3.59},
    {"categoria": "Outros", "codigo": "94550", "descricao": "Esponja de Aço Bombril 45g Pacotinho C/6", "quantidade": 1, "unidade": "Unidade", "valor_total": 2.18, "valor_unitario": 2.18},
    {"categoria": "Outros", "codigo": "86344", "descricao": "Massa C/Ovos Orquidea 500g Argola", "quantidade": 1, "unidade": "Unidade", "valor_total": 3.69, "valor_unitario": 3.69},
    {"categoria": "Outros", "codigo": "4542", "descricao": "Sal Refinado Globo 1kg", "quantidade": 1, "unidade": "Unidade", "valor_total": 2.59, "valor_unitario": 2.59},
    {"categoria": "Laticínios", "codigo": "23914", "descricao": "Queijo Parmesão President 100g Ralado", "quantidade": 1, "unidade": "Unidade", "valor_total": 14.99, "valor_unitario": 14.99},
    {"categoria": "Hortifruti", "codigo": "19496", "descricao": "Alho Kg", "quantidade": 0.435, "unidade": "Kg", "valor_total": 8.69, "valor_unitario": 19.98},
    {"categoria": "Carnes", "codigo": "24616", "descricao": "Filé de Peito de Frango Seara 1kg Bandeja", "quantidade": 1, "unidade": "Unidade", "valor_total": 19.99, "valor_unitario": 19.99},
    {"categoria": "Hortifruti", "codigo": "19221", "descricao": "Cebola Roxa Kg Granel", "quantidade": 0.665, "unidade": "Kg", "valor_total": 4.65, "valor_unitario": 6.99},
    {"categoria": "Limpeza", "codigo": "5601", "descricao": "Detergente Limpol 500ml Cristal", "quantidade": 2, "unidade": "Unidade", "valor_total": 4.96, "valor_unitario": 2.48},
    {"categoria": "Limpeza", "codigo": "5902", "descricao": "Limpeza Perfumada Casa e Perfume 1L Sensualidade", "quantidade": 1, "unidade": "Unidade", "valor_total": 8.99, "valor_unitario": 8.99},
    {"categoria": "Laticínios", "codigo": "2054", "descricao": "Creme de Leite Italac 200g", "quantidade": 2, "unidade": "Unidade", "valor_total": 3.96, "valor_unitario": 1.98},
    {"categoria": "Limpeza", "codigo": "5601", "descricao": "Detergente Limpol 500ml Cristal", "quantidade": 1, "unidade": "Unidade", "valor_total": 2.48, "valor_unitario": 2.48},
    {"categoria": "Outros", "codigo": "30289", "descricao": "Aveia em Grãos Quaker 450g Finos", "quantidade": 1, "unidade": "Unidade", "valor_total": 14.99, "valor_unitario": 14.99},
    {"categoria": "Hortifruti", "codigo": "19607", "descricao": "Rúcula 1un", "quantidade": 1, "unidade": "Unidade", "valor_total": 3.19, "valor_unitario": 3.19},
    {"categoria": "Laticínios", "codigo": "55378", "descricao": "Requeijão Cremoso Tirolez 200g Tradicional", "quantidade": 1, "unidade": "Unidade", "valor_total": 8.98, "valor_unitario": 8.98},
    {"categoria": "Outros", "codigo": "723", "descricao": "Azeite Extra Virgem Andorinha 250ml VD", "quantidade": 1, "unidade": "Unidade", "valor_total": 17.99, "valor_unitario": 17.99},
    {"categoria": "Laticínios", "codigo": "19326", "descricao": "Ovos Brancos no Crivo Unidade C/30", "quantidade": 1, "unidade": "Unidade", "valor_total": 15.75, "valor_unitario": 15.75},
    {"categoria": "Limpeza", "codigo": "83975", "descricao": "Sabão em Pó Tixan Ype 1,6kg Primavera Sache", "quantidade": 1, "unidade": "Unidade", "valor_total": 17.19, "valor_unitario": 17.19},
    {"categoria": "Limpeza", "codigo": "55309", "descricao": "Sabão em Pó Surf 800g Explosão de Flores", "quantidade": 1, "unidade": "Unidade", "valor_total": 9.39, "valor_unitario": 9.39},
    {"categoria": "Limpeza", "codigo": "5335", "descricao": "Cloro Cloral 2L", "quantidade": 1, "unidade": "Unidade", "valor_total": 8.39, "valor_unitario": 8.39},
    {"categoria": "Bebidas", "codigo": "21293", "descricao": "Suco Concentrado Imbiara 980ml Caju", "quantidade": 1, "unidade": "Unidade", "valor_total": 8.28, "valor_unitario": 8.28},
    {"categoria": "Bebidas", "codigo": "27031", "descricao": "Chá Pronto Matte Leão 1.5L Natural", "quantidade": 2, "unidade": "Unidade", "valor_total": 15.98, "valor_unitario": 7.99}
  ]
};

export async function testarInsercaoDireta(userId = 'ae5b5501-7f8a-46da-9cba-b9955a84e697') {
  console.log('🧪 TESTE DE INSERÇÃO DIRETA - INICIANDO');
  console.log('📋 JSON do cupom:', jsonCupomCostazul);
  console.log('📋 Total de itens:', jsonCupomCostazul.itens.length);
  
  // Limpar estoque atual
  console.log('🧹 Limpando estoque atual...');
  const { error: deleteError } = await supabase
    .from('estoque_app')
    .delete()
    .eq('user_id', userId);
  
  if (deleteError) {
    console.error('❌ Erro ao limpar estoque:', deleteError);
    return;
  }
  
  let sucessos = 0;
  let totalValor = 0;
  
  // Inserir cada item EXATAMENTE como está no JSON
  for (let i = 0; i < jsonCupomCostazul.itens.length; i++) {
    const item = jsonCupomCostazul.itens[i];
    
    const produto = {
      user_id: userId,
      produto_nome: item.descricao,
      categoria: item.categoria.toLowerCase(),
      quantidade: item.quantidade,
      unidade_medida: item.unidade === 'Unidade' ? 'UN' : item.unidade,
      preco_unitario_ultimo: item.valor_unitario,
      origem: 'teste_direto'
    };
    
    console.log(`[${i+1}] INSERINDO:`, produto);
    
    const { data: insertData, error: insertError } = await supabase
      .from('estoque_app')
      .insert(produto)
      .select();
    
    if (insertError) {
      console.error(`❌ [${i+1}] ERRO:`, insertError);
    } else {
      console.log(`✅ [${i+1}] OK - ID:`, insertData[0]?.id);
      sucessos++;
      totalValor += (item.quantidade * item.valor_unitario);
    }
  }
  
  // Verificar resultado final
  const { data: estoqueInserido } = await supabase
    .from('estoque_app')
    .select('*')
    .eq('user_id', userId);
  
  console.log('🎯 RESULTADO FINAL:');
  console.log('📦 Itens inseridos:', sucessos, '/', jsonCupomCostazul.itens.length);
  console.log('💰 Valor total calculado:', totalValor.toFixed(2));
  console.log('💰 Valor esperado:', '211.16');
  console.log('📋 Estoque final:', estoqueInserido?.length || 0, 'registros');
  
  return {
    itensInseridos: sucessos,
    totalItens: jsonCupomCostazul.itens.length,
    valorCalculado: totalValor,
    valorEsperado: 211.16,
    estoqueFinal: estoqueInserido
  };
}

// Para usar no browser console:
// testarInsercaoDireta().then(resultado => console.log('RESULTADO:', resultado));