import { supabase } from "@/integrations/supabase/client";

// Função para executar processo direto
export const executarProcessamentoDireto = async () => {
  try {
    console.log('🚀 EXECUTANDO PROCESSAMENTO DIRETO...');
    
    const notaId = 'bfb8097d-dc10-4739-8182-b00f95730148';
    const userId = 'ae5b5501-7f8a-46da-9cba-b9955a84e697';
    
    // 1. Verificar estoque ANTES
    console.log('📦 Verificando estoque ANTES...');
    const { data: estoqueAntes } = await supabase
      .from('estoque_app')
      .select('*')
      .eq('user_id', userId);
    console.log(`📦 Estoque ANTES: ${estoqueAntes?.length || 0} itens`);
    
    // 2. Verificar nota
    console.log('📋 Verificando nota...');
    const { data: nota } = await supabase
      .from('notas_imagens')
      .select('*')
      .eq('id', notaId)
      .single();
    console.log('📋 Nota encontrada:', nota?.processada ? 'JÁ PROCESSADA' : 'NÃO PROCESSADA');
    console.log('📋 Itens na nota:', (nota?.dados_extraidos as any)?.itens?.length || 0);
    
    // 3. Chamar função
    console.log('🔧 Chamando process-receipt-full...');
    const { data, error } = await supabase.functions.invoke('process-receipt-full', {
      body: { imagemId: notaId }
    });
    
    if (error) {
      console.error('❌ ERRO na função:', error);
      return { success: false, error };
    }
    
    console.log('✅ RESPOSTA da função:', data);
    
    // 4. Verificar estoque DEPOIS
    console.log('📦 Verificando estoque DEPOIS...');
    const { data: estoqueDepois } = await supabase
      .from('estoque_app')
      .select('*')
      .eq('user_id', userId);
    console.log(`📦 Estoque DEPOIS: ${estoqueDepois?.length || 0} itens`);
    
    // 5. Verificar se nota foi marcada como processada
    const { data: notaFinal } = await supabase
      .from('notas_imagens')
      .select('processada')
      .eq('id', notaId)
      .single();
    console.log('📋 Nota após processamento:', notaFinal?.processada ? 'PROCESSADA' : 'NÃO PROCESSADA');
    
    return {
      success: true,
      estoqueAntes: estoqueAntes?.length || 0,
      estoqueDepois: estoqueDepois?.length || 0,
      notaProcessada: notaFinal?.processada,
      resposta: data
    };
    
  } catch (error) {
    console.error('❌ ERRO GERAL:', error);
    return { success: false, error: error.message };
  }
};

// Disponibilizar no window
if (typeof window !== 'undefined') {
  (window as any).executarProcessamentoDireto = executarProcessamentoDireto;
}