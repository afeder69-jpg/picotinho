import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export default function TestAwaitFlag() {
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState('');

  const testWithAwait = async () => {
    setLoading(true);
    setLogs('🧪 Iniciando teste com USE_AWAIT_FOR_IA_2=true...\n');
    
    try {
      const { data, error } = await supabase.functions.invoke('process-danfe-pdf', {
        body: {
          pdfUrl: "https://mjsbwrtegorjxcepvrik.supabase.co/storage/v1/object/public/receipts/ae5b5501-7f8a-46da-9cba-b9955a84e697/whatsapp_1758988340795_documento.pdf",
          notaImagemId: "37b8b17d-5cb9-4030-b854-399146f79928", 
          userId: "ae5b5501-7f8a-46da-9cba-b9955a84e697"
        }
      });

      if (error) {
        setLogs(prev => prev + `❌ Erro: ${JSON.stringify(error)}\n`);
      } else {
        setLogs(prev => prev + `✅ Sucesso: ${JSON.stringify(data)}\n`);
      }
    } catch (err) {
      setLogs(prev => prev + `❌ Exception: ${err}\n`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">Teste Flag USE_AWAIT_FOR_IA_2</h1>
      
      <button 
        onClick={testWithAwait} 
        disabled={loading}
        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
      >
        {loading ? 'Testando...' : 'Executar Teste'}
      </button>
      
      <div className="mt-4">
        <h3 className="font-semibold mb-2">Logs do Teste:</h3>
        <pre className="bg-gray-100 p-4 rounded overflow-auto max-h-96 text-sm">
          {logs || 'Nenhum log ainda...'}
        </pre>
      </div>
      
      <div className="mt-4 text-sm text-gray-600">
        <p><strong>Objetivo:</strong> Verificar se aparecem os logs na sequência:</p>
        <ol className="list-decimal list-inside mt-2">
          <li>T1: chamando IA-2 com AWAIT</li>
          <li>T2: IA-2 START</li>
          <li>Resultado (sucesso ou erro claro)</li>
        </ol>
      </div>
    </div>
  );
}