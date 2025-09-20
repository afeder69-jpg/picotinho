import { supabase } from "@/integrations/supabase/client";

export const testProcessReceiptFunction = async () => {
  try {
    console.log('🚀 Chamando process-receipt-full...');
    
    const { data, error } = await supabase.functions.invoke('process-receipt-full', {
      body: {
        imagemId: '12b186ce-a6fb-408e-be95-f793ec38d9ba'
      }
    });
    
    if (error) {
      console.error('❌ Erro na função:', error);
      return { success: false, error };
    }
    
    console.log('✅ Resultado da função:', data);
    
    // Verificar se o estoque foi populado
    const { data: estoque, error: estoqueError } = await supabase
      .from('estoque_app')
      .select('*')
      .eq('user_id', 'ae5b5501-7f8a-46da-9cba-b9955a84e697');
    
    console.log('📦 Estoque após processamento:', estoque);
    
    return { success: true, data, estoque };
  } catch (error) {
    console.error('❌ Erro no teste:', error);
    return { success: false, error: error.message };
  }
};

// Adicionar botão para testar no console
if (typeof window !== 'undefined') {
  (window as any).testProcessReceiptFunction = testProcessReceiptFunction;
}