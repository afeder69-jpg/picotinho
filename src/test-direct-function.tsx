import { supabase } from "@/integrations/supabase/client";

export const testDirectFunction = async () => {
  try {
    console.log('🔧 TESTANDO FUNÇÃO DIRETAMENTE...');
    
    const notaId = '43d91fa0-2382-4b9c-826b-615bd7ceff15';
    const userId = 'ae5b5501-7f8a-46da-9cba-b9955a84e697';
    
    // Verificar estoque ANTES
    const { data: estoqueAntes } = await supabase
      .from('estoque_app')
      .select('*')
      .eq('user_id', userId);
    console.log(`📦 Estoque ANTES: ${estoqueAntes?.length || 0} itens`);
    
    // Chamar função
    const { data, error } = await supabase.functions.invoke('process-receipt-full', {
      body: { imagemId: notaId }
    });
    
    if (error) {
      console.error('❌ ERRO:', error);
      return { success: false, error };
    }
    
    console.log('✅ RESPOSTA:', data);
    
    // Verificar estoque DEPOIS
    const { data: estoqueDepois } = await supabase
      .from('estoque_app')
      .select('*')
      .eq('user_id', userId);
    console.log(`📦 Estoque DEPOIS: ${estoqueDepois?.length || 0} itens`);
    
    return {
      success: true,
      estoque_antes: estoqueAntes?.length || 0,
      estoque_depois: estoqueDepois?.length || 0,
      resposta: data
    };
    
  } catch (error) {
    console.error('❌ ERRO GERAL:', error);
    return { success: false, error: error.message };
  }
};

// Execute automaticamente ao carregar
testDirectFunction();