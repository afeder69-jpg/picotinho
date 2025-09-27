import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export default function ExecuteTestAwait() {
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState('');

  const executeTest = async () => {
    setExecuting(true);
    setResult('🧪 Executando test-danfe-await...\n');
    
    try {
      const { data, error } = await supabase.functions.invoke('test-danfe-await', {
        body: {}
      });

      if (error) {
        setResult(prev => prev + `❌ Erro: ${JSON.stringify(error, null, 2)}\n`);
      } else {
        setResult(prev => prev + `✅ Resultado: ${JSON.stringify(data, null, 2)}\n`);
      }
      
      setResult(prev => prev + '\n📋 Agora verificando logs das edge functions...\n');
      
    } catch (err) {
      setResult(prev => prev + `❌ Exception: ${err}\n`);
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">Executar Test AWAIT Flag</h1>
      
      <button 
        onClick={executeTest} 
        disabled={executing}
        className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
      >
        {executing ? 'Executando...' : 'Executar test-danfe-await'}
      </button>
      
      <div className="mt-4">
        <h3 className="font-semibold mb-2">Resultado da Execução:</h3>
        <pre className="bg-gray-100 p-4 rounded overflow-auto max-h-96 text-sm">
          {result || 'Pronto para executar...'}
        </pre>
      </div>
      
      <div className="text-sm text-gray-600">
        <p><strong>Objetivo:</strong> Executar o teste e verificar logs T1 → T2 → Resultado</p>
      </div>
    </div>
  );
}