import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';

export default function TestNormalizacaoCasos() {
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState<any>(null);

  const executarTeste = async () => {
    setLoading(true);
    setResultado(null);
    
    try {
      console.log('🧪 Executando teste de normalização IA-2...');
      
      const { data, error } = await supabase.functions.invoke('test-normalizacao-casos', {
        body: {}
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

  const testeCasoIndividual = async (caso: string) => {
    try {
      console.log(`🔍 Testando caso individual: ${caso}`);
      
      const { data, error } = await supabase.functions.invoke('normalizar-produto-ia3', {
        body: { nomeOriginal: caso }
      });
      
      if (error) {
        console.error(`❌ Erro para ${caso}:`, error);
      } else {
        console.log(`✅ Resultado para ${caso}:`, data);
      }
    } catch (error) {
      console.error(`💥 Exceção para ${caso}:`, error);
    }
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">🧪 Teste Normalização IA-2 - Casos Específicos</h1>
      
      <div className="space-y-4">
        <Button 
          onClick={executarTeste} 
          disabled={loading}
          size="lg"
          variant="default"
        >
          {loading ? '🔄 Executando...' : '🧪 Executar Teste Completo'}
        </Button>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <Button 
            onClick={() => testeCasoIndividual('Tempero Verde 1 UNIDADE')} 
            size="sm"
            variant="outline"
          >
            🧪 Tempero Verde
          </Button>
          
          <Button 
            onClick={() => testeCasoIndividual('Milho Verde Predileto 170 G Lata')} 
            size="sm"
            variant="outline"
          >
            🧪 Milho Verde
          </Button>
          
          <Button 
            onClick={() => testeCasoIndividual('FILE PEITO BDJ SEARA 1K')} 
            size="sm"
            variant="outline"
          >
            🧪 Filé de Peito
          </Button>
          
          <Button 
            onClick={() => testeCasoIndividual('ABACATE GRANEL')} 
            size="sm"
            variant="outline"
          >
            🧪 Abacate Granel
          </Button>
        </div>
        
        {resultado && (
          <div className="mt-6 p-4 border rounded-lg">
            <h3 className="font-semibold mb-2">📊 Resultado:</h3>
            <pre className="text-xs bg-gray-100 p-2 rounded overflow-auto max-h-96">
              {JSON.stringify(resultado, null, 2)}
            </pre>
            
            {resultado.feature_flag_ativa !== undefined && (
              <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded">
                <p className="text-blue-800">
                  <strong>Feature Flag NORMALIZACAO_PRODUTOS_V1:</strong> {resultado.feature_flag_ativa ? '✅ ATIVA' : '❌ DESABILITADA'}
                </p>
                <p className="text-blue-800">
                  <strong>Marcas encontradas:</strong> {resultado.marcas_encontradas?.join(', ') || 'Nenhuma'}
                </p>
                <p className="text-blue-800">
                  <strong>Casos testados:</strong> {resultado.total_casos} | 
                  <strong> Sucessos:</strong> {resultado.casos_sucesso} | 
                  <strong> Erros:</strong> {resultado.casos_erro}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}