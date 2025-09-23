import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';

export default function TestSmartMatcher() {
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState<any>(null);

  const executarNormalizacao = async (limite = 10, userId?: string) => {
    setLoading(true);
    setResultado(null);
    
    try {
      console.log(`🚀 Executando normalização automática (limite: ${limite})...`);
      
      const { data, error } = await supabase.functions.invoke('normalizar-estoque-automatico', {
        body: { limite, userId }
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

  const testarProdutoEspecifico = async (nomeProduto: string) => {
    setLoading(true);
    
    try {
      console.log(`🧪 Testando produto específico: "${nomeProduto}"`);
      
      const { data, error } = await supabase.functions.invoke('smart-product-matcher', {
        body: { produtoNome: nomeProduto, userId: null }
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
      <h1 className="text-3xl font-bold mb-6">🧠 Smart Product Matcher - Revolução da Normalização</h1>
      
      <div className="space-y-6">
        {/* Normalização Automática */}
        <div className="border rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">🤖 Normalização Automática</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <Button 
              onClick={() => executarNormalizacao(10)} 
              disabled={loading}
              variant="default"
            >
              {loading ? '🔄 Executando...' : '🚀 Normalizar 10 Produtos'}
            </Button>
            
            <Button 
              onClick={() => executarNormalizacao(50)} 
              disabled={loading}
              variant="secondary"
            >
              {loading ? '🔄 Executando...' : '⚡ Normalizar 50 Produtos'}
            </Button>
            
            <Button 
              onClick={() => executarNormalizacao(100)} 
              disabled={loading}
              variant="outline"
            >
              {loading ? '🔄 Executando...' : '💪 Normalizar 100 Produtos'}
            </Button>
          </div>
        </div>

        {/* Testes Específicos */}
        <div className="border rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">🧪 Testes Específicos</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Button 
              onClick={() => testarProdutoEspecifico('Creme Leite Italac 200g')} 
              size="sm"
              variant="outline"
            >
              🧪 Creme Leite Italac
            </Button>
            
            <Button 
              onClick={() => testarProdutoEspecifico('Creme de Leite Italac 200g')} 
              size="sm"
              variant="outline"
            >
              🧪 Creme de Leite Italac
            </Button>
            
            <Button 
              onClick={() => testarProdutoEspecifico('Chá Mate Matte Leão Natural 1,5L')} 
              size="sm"
              variant="outline"
            >
              🧪 Chá Mate Matte Leão
            </Button>
            
            <Button 
              onClick={() => testarProdutoEspecifico('Chá Pronto Matte Leão 1,5L Natural')} 
              size="sm"
              variant="outline"
            >
              🧪 Chá Pronto Matte Leão
            </Button>

            <Button 
              onClick={() => testarProdutoEspecifico('Leite Integral Piracanjuba 1L')} 
              size="sm"
              variant="outline"
            >
              🧪 Leite Integral Piracanjuba
            </Button>
            
            <Button 
              onClick={() => testarProdutoEspecifico('Leite Integral 1L Piracanjuba')} 
              size="sm"
              variant="outline"
            >
              🧪 Leite 1L Piracanjuba
            </Button>
          </div>
        </div>
        
        {/* Resultados */}
        {resultado && (
          <div className="border rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-4">📊 Resultado da Execução:</h3>
            
            {resultado.success && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div className="bg-green-50 border border-green-200 rounded p-3">
                  <p className="text-green-800 font-semibold">✅ Processados</p>
                  <p className="text-2xl font-bold text-green-600">
                    {resultado.produtos_processados || resultado.produtos_atualizados || 'N/A'}
                  </p>
                </div>
                
                {resultado.produtos_atualizados !== undefined && (
                  <div className="bg-blue-50 border border-blue-200 rounded p-3">
                    <p className="text-blue-800 font-semibold">🎯 Atualizados</p>
                    <p className="text-2xl font-bold text-blue-600">{resultado.produtos_atualizados}</p>
                  </div>
                )}
                
                {resultado.produtos_com_erro !== undefined && (
                  <div className="bg-red-50 border border-red-200 rounded p-3">
                    <p className="text-red-800 font-semibold">❌ Erros</p>
                    <p className="text-2xl font-bold text-red-600">{resultado.produtos_com_erro}</p>
                  </div>
                )}
              </div>
            )}

            {/* Informações do Match */}
            {resultado.tipo === 'match_encontrado' && (
              <div className="bg-green-50 border border-green-200 rounded p-4 mb-4">
                <h4 className="font-semibold text-green-800 mb-2">🎯 MATCH ENCONTRADO!</h4>
                <p><strong>Produto Original:</strong> {resultado.produto_original}</p>
                <p><strong>Produto Matched:</strong> {resultado.produto_matched}</p>
                <p><strong>Hash:</strong> {resultado.produto_hash_normalizado}</p>
              </div>
            )}

            {resultado.tipo === 'criado_novo' && (
              <div className="bg-blue-50 border border-blue-200 rounded p-4 mb-4">
                <h4 className="font-semibold text-blue-800 mb-2">🆕 PRODUTO NOVO CRIADO!</h4>
                <p><strong>Produto:</strong> {resultado.produto_original}</p>
                <p><strong>Normalizado:</strong> {resultado.produto_nome_normalizado}</p>
                <p><strong>Categoria:</strong> {resultado.categoria}</p>
                <p><strong>Marca:</strong> {resultado.marca || 'N/A'}</p>
              </div>
            )}
            
            <pre className="text-xs bg-gray-100 p-3 rounded overflow-auto max-h-64">
              {JSON.stringify(resultado, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}