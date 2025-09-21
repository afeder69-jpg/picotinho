console.log('🚀 INICIANDO TESTE DIRETO...');

import { supabase } from "@/integrations/supabase/client";

const executeTeste = async () => {
  try {
    const notaId = 'c0fcbecd-0a1b-49bb-a026-5f335ed7774c'; // Nota mais recente processada
    
    console.log('🔧 Chamando process-receipt-full para nota:', notaId);
    
    const { data, error } = await supabase.functions.invoke('process-receipt-full', {
      body: { notaId: notaId }
    });
    
    if (error) {
      console.error('❌ ERRO:', error);
      return;
    }
    
    console.log('✅ RESULTADO:', data);
    
    // Verificar estoque
    const { data: estoque } = await supabase
      .from('estoque_app')
      .select('*')
      .eq('user_id', 'ae5b5501-7f8a-46da-9cba-b9955a84e697');
    
    console.log(`📦 ESTOQUE FINAL: ${estoque?.length || 0} itens`);
    
    if (estoque && estoque.length > 0) {
      console.table(estoque.map(item => ({
        produto: item.produto_nome,
        quantidade: item.quantidade,
        preco: `R$ ${item.preco_unitario_ultimo}`
      })));
    }
    
  } catch (error) {
    console.error('❌ ERRO GERAL:', error);
  }
};

// Executar automaticamente
executeTeste();