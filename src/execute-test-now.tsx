import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export default function ExecuteTestNow() {
  const [status, setStatus] = useState('Iniciando...');
  const [result, setResult] = useState('');

  useEffect(() => {
    const executeTest = async () => {
      try {
        setStatus('🧪 Executando test-danfe-await...');
        
        const { data, error } = await supabase.functions.invoke('test-danfe-await', {
          body: {}
        });

        if (error) {
          setStatus('❌ Erro na execução');
          setResult(`Erro: ${JSON.stringify(error, null, 2)}`);
        } else {
          setStatus('✅ Executado com sucesso');
          setResult(`Resultado: ${JSON.stringify(data, null, 2)}`);
        }
      } catch (err) {
        setStatus('❌ Exception');
        setResult(`Exception: ${err}`);
      }
    };

    executeTest();
  }, []);

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">Teste Executado Automaticamente</h1>
      <p><strong>Status:</strong> {status}</p>
      <div className="bg-gray-100 p-4 rounded">
        <h3 className="font-semibold">Resultado:</h3>
        <pre className="text-sm">{result || 'Aguardando...'}</pre>
      </div>
      <div className="text-sm text-gray-600">
        <p><strong>IMPORTANTE:</strong> Agora verificar os logs do Supabase Analytics para:</p>
        <ul className="list-disc list-inside">
          <li>T1: chamando IA-2 com AWAIT</li>
          <li>T2: IA-2 START</li>
          <li>Resultado: process-receipt-full SUCESSO/ERRO</li>
        </ul>
      </div>
    </div>
  );
}