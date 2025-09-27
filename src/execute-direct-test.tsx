import { supabase } from '@/integrations/supabase/client';

console.log("🧪 EXECUTANDO TESTE DIRETO DA FUNÇÃO test-danfe-await");

// Executar imediatamente
(async () => {
  try {
    console.log("🔥 Chamando test-danfe-await...");
    
    const { data, error } = await supabase.functions.invoke('test-danfe-await', {
      body: {}
    });

    if (error) {
      console.error("❌ Erro na execução:", error);
    } else {
      console.log("✅ Sucesso na execução:", data);
    }
    
    // Aguardar um pouco para os logs aparecerem
    setTimeout(() => {
      console.log("📋 Verifique os logs das edge functions para ver T1 → T2 → Resultado");
    }, 2000);
    
  } catch (err) {
    console.error("❌ Exception:", err);
  }
})();

export default function ExecuteDirectTest() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">Teste Executado</h1>
      <p>O teste foi executado automaticamente. Verifique o console para ver o resultado.</p>
      <p className="text-gray-600 mt-2">
        Aguarde e verifique os logs das edge functions para ver:
        <br />T1: chamando IA-2 com AWAIT
        <br />T2: IA-2 START
        <br />Resultado da execução
      </p>
    </div>
  );
}