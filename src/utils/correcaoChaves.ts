import { supabase } from "@/integrations/supabase/client";

export const executarCorrecaoChaves = async () => {
  try {
    console.log('🔧 Iniciando correção de chaves de acesso...');
    
    const { data, error } = await supabase.functions.invoke('fix-missing-access-keys', {
      body: {}
    });

    if (error) {
      console.error('❌ Erro na correção:', error);
      return { success: false, error: error.message };
    }

    console.log('✅ Correção concluída:', data);
    return { success: true, ...data };
    
  } catch (error) {
    console.error('❌ Erro ao executar correção:', error);
    return { success: false, error: error.message };
  }
};