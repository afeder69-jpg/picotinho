console.log('🚀 INICIANDO TESTE DE LIMPEZA DE DUPLICADOS...');

import { supabase } from "@/integrations/supabase/client";

const executeTeste = async () => {
  try {
    console.log('📊 Verificando estado atual do estoque...');
    
    // 1. Ver estado atual antes da limpeza
    const { data: estoqueAntes } = await supabase
      .from('estoque_app')
      .select('*')
      .eq('user_id', 'ae5b5501-7f8a-46da-9cba-b9955a84e697')
      .order('produto_nome');
    
    console.log(`📦 ANTES: ${estoqueAntes?.length || 0} registros no banco`);
    
    const comQuantidade = estoqueAntes?.filter(item => item.quantidade > 0) || [];
    const semQuantidade = estoqueAntes?.filter(item => item.quantidade <= 0) || [];
    
    console.log(`📦 Com quantidade > 0: ${comQuantidade.length}`);
    console.log(`📦 Com quantidade <= 0: ${semQuantidade.length}`);
    
    console.table(estoqueAntes?.slice(0, 10).map(item => ({
      produto: item.produto_nome,
      quantidade: item.quantidade,
      preco: `R$ ${item.preco_unitario_ultimo || 0}`,
      nota_id: item.nota_id?.substring(0, 8) + '...'
    })));
    
    console.log('🧹 Executando limpeza de duplicados...');
    
    // 2. Executar limpeza
    const { data: cleanupResult, error: cleanupError } = await supabase.functions.invoke('cleanup-duplicated-stock', {
      body: { userId: 'ae5b5501-7f8a-46da-9cba-b9955a84e697' }
    });
    
    if (cleanupError) {
      console.error('❌ ERRO na limpeza:', cleanupError);
      return;
    }
    
    console.log('✅ RESULTADO DA LIMPEZA:', cleanupResult);
    
    // 3. Verificar estoque após limpeza
    const { data: estoqueDepois } = await supabase
      .from('estoque_app')
      .select('*')
      .eq('user_id', 'ae5b5501-7f8a-46da-9cba-b9955a84e697')
      .order('produto_nome');
    
    console.log(`📦 APÓS LIMPEZA: ${estoqueDepois?.length || 0} registros no banco`);
    
    if (estoqueDepois && estoqueDepois.length > 0) {
      console.log('📦 ESTOQUE FINAL:');
      console.table(estoqueDepois.map(item => ({
        produto: item.produto_nome,
        quantidade: item.quantidade,
        preco: `R$ ${item.preco_unitario_ultimo || 0}`,
        nota_id: item.nota_id?.substring(0, 8) + '...'
      })));
    }
    
  } catch (error) {
    console.error('❌ ERRO GERAL:', error);
  }
};

// Executar automaticamente
executeTeste();