import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';

export default function TestNormalizacao() {
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState<any>(null);

  const executarBackfill = async (tabela: string) => {
    setLoading(true);
    setResultado(null);
    
    try {
      console.log(`🔄 Executando normalização em massa para ${tabela}...`);
      
      const { data, error } = await supabase.functions.invoke('backfill-normalizacao-produtos', {
        body: { tabela, limite: 1000 }
      });
      
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
      <h1 className="text-2xl font-bold mb-4">🔧 Normalização de Produtos</h1>
      
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Button 
            onClick={() => executarBackfill('estoque_app')} 
            disabled={loading}
            size="lg"
            variant="default"
          >
            {loading ? '🔄 Executando...' : '📦 Normalizar Estoque'}
          </Button>
          
          <Button 
            onClick={() => executarBackfill('precos_atuais')} 
            disabled={loading}
            size="lg"
            variant="secondary"
          >
            {loading ? '🔄 Executando...' : '💰 Normalizar Preços Gerais'}
          </Button>
          
          <Button 
            onClick={() => executarBackfill('precos_atuais_usuario')} 
            disabled={loading}
            size="lg"
            variant="outline"
          >
            {loading ? '🔄 Executando...' : '👤 Normalizar Preços Usuário'}
          </Button>
        </div>
        
        {resultado && (
          <div className="mt-6 p-4 border rounded-lg">
            <h3 className="font-semibold mb-2">📊 Resultado:</h3>
            <pre className="text-sm bg-gray-100 p-2 rounded overflow-auto max-h-96">
              {JSON.stringify(resultado, null, 2)}
            </pre>
            
            {resultado.success && (
              <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded">
                <p className="text-green-800">
                  ✅ <strong>Processados:</strong> {resultado.itens_processados} | 
                  <strong> Atualizados:</strong> {resultado.itens_atualizados} | 
                  <strong> Erros:</strong> {resultado.erros}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}