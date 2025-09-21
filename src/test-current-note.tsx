import { supabase } from "@/integrations/supabase/client";

export const testCurrentNote = async () => {
  try {
    console.log('🚀 TESTANDO NOTA ATUAL...');
    
    const userId = 'ae5b5501-7f8a-46da-9cba-b9955a84e697';
    
    // 1. Buscar nota mais recente
    console.log('📋 Buscando nota mais recente...');
    const { data: notas } = await supabase
      .from('notas_imagens')
      .select('*')
      .eq('usuario_id', userId)
      .order('created_at', { ascending: false })
      .limit(1);
    
    if (!notas || notas.length === 0) {
      console.error('❌ Nenhuma nota encontrada');
      return;
    }
    
    const nota = notas[0];
    console.log('📋 Nota encontrada:', {
      id: nota.id,
      processada: nota.processada,
      tem_dados: !!nota.dados_extraidos,
      total_itens: (nota.dados_extraidos as any)?.itens?.length || 0
    });
    
    // 2. Verificar estoque ANTES
    const { data: estoqueAntes } = await supabase
      .from('estoque_app')
      .select('*')
      .eq('user_id', userId);
    console.log(`📦 Estoque ANTES: ${estoqueAntes?.length || 0} itens`);
    
    // 3. Chamar function
    console.log('🔧 Chamando process-receipt-full...');
    const { data, error } = await supabase.functions.invoke('process-receipt-full', {
      body: { imagemId: nota.id }
    });
    
    if (error) {
      console.error('❌ ERRO na função:', error);
      return { success: false, error };
    }
    
    console.log('✅ RESPOSTA da função:', data);
    
    // 4. Verificar estoque DEPOIS
    const { data: estoqueDepois } = await supabase
      .from('estoque_app')
      .select('*')
      .eq('user_id', userId);
    console.log(`📦 Estoque DEPOIS: ${estoqueDepois?.length || 0} itens`);
    
    return {
      success: true,
      nota_id: nota.id,
      itens_na_nota: (nota.dados_extraidos as any)?.itens?.length || 0,
      estoque_antes: estoqueAntes?.length || 0,
      estoque_depois: estoqueDepois?.length || 0,
      resposta: data
    };
    
  } catch (error) {
    console.error('❌ ERRO GERAL:', error);
    return { success: false, error: error.message };
  }
};

// Disponibilizar no window
if (typeof window !== 'undefined') {
  (window as any).testCurrentNote = testCurrentNote;
}