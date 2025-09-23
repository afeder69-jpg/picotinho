import { supabase } from "@/integrations/supabase/client";

export const testarNormalizacao = async () => {
  try {
    console.log('🧪 Testando normalização IA-2...');
    
    const { data, error } = await supabase.functions.invoke('normalizar-produto-ia2', {
      body: {
        descricao: 'Chá Mate Matte Leão Natural 1,5L'
      }
    });

    if (error) {
      console.error('❌ Erro na normalização:', error);
      return { success: false, error };
    }

    console.log('✅ Resultado da normalização:', data);
    return { success: true, data };
  } catch (error) {
    console.error('❌ Erro geral:', error);
    return { success: false, error };
  }
};

// Executar teste automaticamente
testarNormalizacao().then(resultado => {
  console.log('🧪 Teste concluído:', resultado);
});