import { supabase } from "@/integrations/supabase/client";

// FUNÇÃO DESABILITADA PARA EVITAR EXECUÇÃO AUTOMÁTICA
const testeExecuteNow = async () => {
  try {
    console.log('🚀 EXECUTANDO TESTE DIRETO DA FUNÇÃO...');
    
    const notaId = '43d91fa0-2382-4b9c-826b-615bd7ceff15';
    const userId = 'ae5b5501-7f8a-46da-9cba-b9955a84e697';
    
    console.log('📋 Processando nota:', notaId);
    console.log('👤 Usuário:', userId);
    
    // Verificar estoque ANTES
    const { data: estoqueAntes } = await supabase
      .from('estoque_app')
      .select('*')
      .eq('user_id', userId);
    console.log(`📦 Estoque ANTES: ${estoqueAntes?.length || 0} itens`);
    
    // Chamar função process-receipt-full
    console.log('🔧 Chamando process-receipt-full...');
    const { data, error } = await supabase.functions.invoke('process-receipt-full', {
      body: { imagemId: notaId }
    });
    
    if (error) {
      console.error('❌ ERRO na função:', error);
      return;
    }
    
    console.log('✅ RESPOSTA da função:', data);
    
    // Verificar estoque DEPOIS
    const { data: estoqueDepois } = await supabase
      .from('estoque_app')
      .select('*')
      .eq('user_id', userId);
    console.log(`📦 Estoque DEPOIS: ${estoqueDepois?.length || 0} itens`);
    
    if (estoqueDepois && estoqueDepois.length > 0) {
      console.log('🎉 SUCESSO! Itens inseridos no estoque:');
      estoqueDepois.forEach((item, index) => {
        console.log(`${index + 1}. ${item.produto_nome} - Qtd: ${item.quantidade} - Preço: R$ ${item.preco_unitario_ultimo}`);
      });
    }
    
    // Calcular valor total
    const valorTotal = estoqueDepois?.reduce((total, item) => 
      total + (item.quantidade * (item.preco_unitario_ultimo || 0)), 0) || 0;
    console.log(`💰 Valor total do estoque: R$ ${valorTotal.toFixed(2)}`);
    
  } catch (error) {
    console.error('❌ ERRO GERAL:', error);
  }
}; 

// FUNÇÃO DESABILITADA PARA EVITAR EXECUÇÃO AUTOMÁTICA
// Para executar, chame: testeExecuteNow()