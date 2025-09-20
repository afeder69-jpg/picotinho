import { supabase } from "@/integrations/supabase/client";

export const testProcessReceiptFunction = async () => {
  try {
    console.log('🚀 Chamando process-receipt-full...');
    console.log('🔍 Verificando estoque ANTES do processamento...');
    
    // Verificar estoque atual ANTES
    const { data: estoqueAntes, error: errorAntes } = await supabase
      .from('estoque_app')
      .select('*')
      .eq('user_id', 'ae5b5501-7f8a-46da-9cba-b9955a84e697');
    
    console.log('📦 Estoque ANTES:', estoqueAntes?.length || 0, 'itens');
    
    const { data, error } = await supabase.functions.invoke('process-receipt-full', {
      body: {
        imagemId: 'bfb8097d-dc10-4739-8182-b00f95730148'
      }
    });
    
    if (error) {
      console.error('❌ Erro na função:', error);
      return { success: false, error };
    }
    
    console.log('✅ Resultado da função:', data);
    
    // Verificar se o estoque foi populado DEPOIS
    const { data: estoque, error: estoqueError } = await supabase
      .from('estoque_app')
      .select('*')
      .eq('user_id', 'ae5b5501-7f8a-46da-9cba-b9955a84e697');
    
    console.log('📦 Estoque DEPOIS:', estoque?.length || 0, 'itens');
    console.log('📦 Estoque completo:', estoque);
    
    // Verificar se a nota foi marcada como processada
    const { data: nota } = await supabase
      .from('notas_imagens')
      .select('processada')
      .eq('id', '12b186ce-a6fb-408e-be95-f793ec38d9ba')
      .single();
    
    console.log('📋 Nota processada:', nota?.processada);
    
    return { success: true, data, estoque, nota };
  } catch (error) {
    console.error('❌ Erro no teste:', error);
    return { success: false, error: error.message };
  }
};

// Adicionar botão para testar no console
if (typeof window !== 'undefined') {
  (window as any).testProcessReceiptFunction = testProcessReceiptFunction;
}