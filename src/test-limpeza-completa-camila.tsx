import { supabase } from "@/integrations/supabase/client";

export const executarLimpezaCompleta = async () => {
  try {
    console.log('🧹 Iniciando limpeza completa de resíduos da Camila...');
    
    const { data, error } = await supabase.functions.invoke('limpar-residuos-completo', {
      body: {
        email: 'camilapereira.cp14@gmail.com'
      }
    });

    if (error) {
      console.error('❌ Erro ao chamar função de limpeza:', error);
      return { success: false, error };
    }

    console.log('✅ Limpeza completa executada:', data);
    return data;
  } catch (error) {
    console.error('❌ Erro geral na limpeza:', error);
    return { success: false, error };
  }
};

// Executar automaticamente
executarLimpezaCompleta().then(resultado => {
  console.log('🏁 Limpeza finalizada:', resultado);
});