console.log('🚀 INICIANDO TESTE DIRETO...');

import { supabase } from "@/integrations/supabase/client";

const executeTeste = async () => {
  try {
    console.log('🧹 Limpando duplicados no estoque...');
    
    const { data: cleanupResult, error: cleanupError } = await supabase.functions.invoke('cleanup-duplicated-stock', {
      body: { userId: 'ae5b5501-7f8a-46da-9cba-b9955a84e697' }
    });
    
    if (cleanupError) {
      console.error('❌ ERRO na limpeza:', cleanupError);
      return;
    }
    
    console.log('✅ LIMPEZA CONCLUÍDA:', cleanupResult);
    
    // Verificar estoque final
    const { data: estoque } = await supabase
      .from('estoque_app')
      .select('*')
      .eq('user_id', 'ae5b5501-7f8a-46da-9cba-b9955a84e697')
      .order('produto_nome');
    
    console.log(`📦 ESTOQUE FINAL LIMPO: ${estoque?.length || 0} itens únicos`);
    
    if (estoque && estoque.length > 0) {
      console.table(estoque.map(item => ({
        produto: item.produto_nome,
        quantidade: item.quantidade,
        preco: `R$ ${item.preco_unitario_ultimo}`,
        nota_id: item.nota_id
      })));
    }
    
  } catch (error) {
    console.error('❌ ERRO GERAL:', error);
  }
};

// Executar automaticamente
executeTeste();