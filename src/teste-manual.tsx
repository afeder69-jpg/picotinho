console.log('🚀 CRIANDO FUNÇÃO DE TESTE MANUAL...');

(window as any).testeManual = async () => {
  console.log('🚀 INICIANDO TESTE MANUAL...');
  
  try {
    // Usar supabase do contexto global
    const supabase = (window as any).supabase || await import('./integrations/supabase/client.ts').then(m => m.supabase);
    
    const notaId = '43d91fa0-2382-4b9c-826b-615bd7ceff15';
    console.log('📋 Processando nota:', notaId);
    
    // Verificar estoque ANTES
    const { data: estoqueAntes } = await supabase
      .from('estoque_app')
      .select('*')
      .eq('user_id', 'ae5b5501-7f8a-46da-9cba-b9955a84e697');
    console.log('📦 Estoque ANTES:', estoqueAntes?.length || 0);
    
    // Chamar função
    console.log('🔧 Chamando process-receipt-full...');
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
      .eq('user_id', 'ae5b5501-7f8a-46da-9cba-b9955a84e697');
    console.log('📦 Estoque DEPOIS:', estoqueDepois?.length || 0);
    
    if (estoqueDepois && estoqueDepois.length > 0) {
      console.log('🎉 SUCESSO! Primeiros 5 itens:');
      estoqueDepois.slice(0, 5).forEach((item, index) => {
        console.log(`${index + 1}. ${item.produto_nome} - Qtd: ${item.quantidade} - R$ ${item.preco_unitario_ultimo}`);
      });
    }
    
    return { 
      success: true, 
      data,
      estoque_antes: estoqueAntes?.length || 0,
      estoque_depois: estoqueDepois?.length || 0
    };
    
  } catch (error) {
    console.error('❌ ERRO GERAL:', error);
    return { success: false, error: error.message };
  }
};

console.log('✅ Função testeManual() criada!');