import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';

export default function TestNormalizacao() {
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState<any>(null);

  const executarBackfill = async () => {
    setLoading(true);
    setResultado(null);
    
    try {
      console.log('🔄 Executando normalização em massa...');
      
      const { data, error } = await supabase.functions.invoke('normalizar-estabelecimentos-existentes');
      
      if (error) {
        console.error('❌ Erro:', error);
        setResultado({ success: false, error: error.message });
      } else {
        console.log('✅ Resultado:', data);
        setResultado(data);
      }
    } catch (error) {
      console.error('❌ Erro na execução:', error);
      setResultado({ success: false, error: (error as any).message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">🏪 Teste de Normalização de Estabelecimentos</h1>
      
      <div className="space-y-4">
        <Button 
          onClick={executarBackfill} 
          disabled={loading}
          size="lg"
        >
          {loading ? '🔄 Executando...' : '🚀 Executar Normalização em Massa'}
        </Button>
        
        {resultado && (
          <div className="mt-4 p-4 border rounded-lg">
            <h3 className="font-semibold mb-2">📊 Resultado:</h3>
            <pre className="text-sm bg-gray-100 p-2 rounded overflow-auto">
              {JSON.stringify(resultado, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}