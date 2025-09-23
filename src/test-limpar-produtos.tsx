import { supabase } from "@/integrations/supabase/client";

export const limparProdutosEspecificos = async () => {
  try {
    console.log('🧹 Iniciando limpeza de produtos específicos...');
    
    const { data, error } = await supabase.functions.invoke('limpar-produtos-especificos', {
      body: {
        userId: '1e601806-a7f2-4089-9519-cf65824a8f2f',
        produtoNomes: ['Creme Leite Italac', 'Chá Mate Matte Leão']
      }
    });

    if (error) {
      console.error('❌ Erro ao chamar função:', error);
      return { success: false, error };
    }

    console.log('✅ Resultado:', data);
    return data;
  } catch (error) {
    console.error('❌ Erro geral:', error);
    return { success: false, error };
  }
};

// Executar automaticamente
limparProdutosEspecificos().then(resultado => {
  console.log('🏁 Limpeza finalizada:', resultado);
});