import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Crown } from 'lucide-react';

export default function TestNormalizacao() {
  const [loading, setLoading] = useState(false);
  const [loadingMaster, setLoadingMaster] = useState(false);
  const [resultado, setResultado] = useState<any>(null);

  const executarBackfill = async (tabela: string, forcarReprocessamento = false, consolidar = false) => {
    setLoading(true);
    setResultado(null);
    
    try {
      console.log(`🔄 Executando normalização em massa para ${tabela}...`);
      
      const { data, error } = await supabase.functions.invoke('backfill-normalizacao-produtos', {
        body: { tabela, limite: 1000, forcarReprocessamento, consolidar }
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

  const virarMaster = async () => {
    setLoadingMaster(true);
    try {
      const { data, error } = await supabase.functions.invoke('setup-master-user');
      
      if (error) {
        throw error;
      }

      toast.success("🎉 Você agora é Master! Recarregando...");
      
      // Recarregar a página para atualizar as permissões
      setTimeout(() => {
        window.location.reload();
      }, 1500);

    } catch (error: any) {
      console.error('Erro ao virar Master:', error);
      toast.error("Erro ao configurar Master");
    } finally {
      setLoadingMaster(false);
    }
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">🔧 Normalização de Produtos</h1>
      
      {/* Botão para virar Master */}
      <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
        <div className="flex items-center gap-2 mb-2">
          <Crown className="h-5 w-5 text-yellow-600" />
          <h2 className="font-semibold text-yellow-800">Configuração Master</h2>
        </div>
        <p className="text-sm text-yellow-700 mb-3">
          Para ver o botão "Revisar Normalizações", você precisa ser Master:
        </p>
        <Button 
          onClick={virarMaster}
          disabled={loadingMaster}
          variant="outline"
          className="bg-yellow-100 border-yellow-300 text-yellow-800 hover:bg-yellow-200"
        >
          {loadingMaster ? "Configurando..." : "🎯 Virar Master Agora"}
        </Button>
      </div>
      
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Button 
            onClick={() => executarBackfill('estoque_app')} 
            disabled={loading}
            size="lg"
            variant="default"
          >
            {loading ? '🔄 Executando...' : '📦 Normalizar Novos'}
          </Button>
          
          <Button 
            onClick={() => executarBackfill('estoque_app', true, true)} 
            disabled={true}
            size="lg"
            variant="destructive"
            className="opacity-50 cursor-not-allowed"
          >
            🚫 BOTÃO CONGELADO (Evitar perdas)
          </Button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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