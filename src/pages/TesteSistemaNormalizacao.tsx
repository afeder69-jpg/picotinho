import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const TesteSistemaNormalizacao = () => {
  const [loading, setLoading] = useState(false);
  const [produtoTeste, setProdutoTeste] = useState('');
  const [resultado, setResultado] = useState<any>(null);
  const { toast } = useToast();

  const testarNormalizacao = async () => {
    if (!produtoTeste.trim()) {
      toast({
        title: "Erro",
        description: "Digite um nome de produto para testar",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      console.log('🧪 Testando normalização:', produtoTeste);

      const { data, error } = await supabase.functions.invoke('normalizar-produto-ia2', {
        body: { descricao: produtoTeste }
      });

      if (error) {
        throw error;
      }

      setResultado(data);
      
      toast({
        title: "Teste realizado!",
        description: "Normalização concluída com sucesso",
      });

    } catch (error: any) {
      console.error('❌ Erro no teste:', error);
      toast({
        title: "Erro no teste",
        description: error.message || "Erro desconhecido",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const testarSmartMatcher = async () => {
    if (!produtoTeste.trim()) {
      toast({
        title: "Erro",
        description: "Digite um nome de produto para testar",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      console.log('🧪 Testando Smart Matcher:', produtoTeste);

      const { data: user } = await supabase.auth.getUser();
      if (!user.user) {
        throw new Error('Usuário não autenticado');
      }

      const { data, error } = await supabase.functions.invoke('smart-product-matcher', {
        body: { 
          produtoNome: produtoTeste,
          userId: user.user.id
        }
      });

      if (error) {
        throw error;
      }

      setResultado(data);
      
      toast({
        title: "Smart Matcher testado!",
        description: data.matched ? "Match encontrado!" : "Novo produto criado!",
      });

    } catch (error: any) {
      console.error('❌ Erro no Smart Matcher:', error);
      toast({
        title: "Erro no Smart Matcher",
        description: error.message || "Erro desconhecido",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const testarCorrecao = async () => {
    setLoading(true);
    try {
      console.log('🧪 Testando correção de produtos existentes');

      const { data: user } = await supabase.auth.getUser();
      if (!user.user) {
        throw new Error('Usuário não autenticado');
      }

      const { data, error } = await supabase.functions.invoke('corrigir-produtos-existentes', {
        body: { 
          userId: user.user.id
        }
      });

      if (error) {
        throw error;
      }

      setResultado(data);
      
      toast({
        title: "Correção testada!",
        description: `${data.corrigidos} produtos corrigidos`,
      });

    } catch (error: any) {
      console.error('❌ Erro na correção:', error);
      toast({
        title: "Erro na correção",
        description: error.message || "Erro desconhecido",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const exemplosProdutos = [
    "Creme Leite Italac 200g",
    "Chá Mate Matte Leão Natural 1,5L",
    "Leite Integral Parmalat 1L",
    "Pão de Forma Pullman 450g",
    "Achocolatado em Pó Nescau 380g"
  ];

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold mb-2">🧪 Teste do Sistema de Normalização</h1>
        <p className="text-muted-foreground">Teste as funções IA-2, Smart Matcher e Correção de Produtos</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Teste de Produto</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Digite o nome do produto para testar..."
              value={produtoTeste}
              onChange={(e) => setProdutoTeste(e.target.value)}
              className="flex-1"
            />
          </div>
          
          <div className="flex gap-2 flex-wrap">
            <Button 
              onClick={testarNormalizacao} 
              disabled={loading}
              variant="default"
            >
              {loading ? "Testando..." : "Testar IA-2"}
            </Button>
            
            <Button 
              onClick={testarSmartMatcher} 
              disabled={loading}
              variant="secondary"
            >
              {loading ? "Testando..." : "Testar Smart Matcher"}
            </Button>
            
            <Button 
              onClick={testarCorrecao} 
              disabled={loading}
              variant="outline"
            >
              {loading ? "Corrigindo..." : "Corrigir Produtos Existentes"}
            </Button>
          </div>

          <div className="space-y-2">
            <h4 className="font-semibold">Exemplos para testar:</h4>
            <div className="flex gap-2 flex-wrap">
              {exemplosProdutos.map((exemplo, index) => (
                <Button
                  key={index}
                  variant="ghost"
                  size="sm"
                  onClick={() => setProdutoTeste(exemplo)}
                  className="text-xs"
                >
                  {exemplo}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {resultado && (
        <Card>
          <CardHeader>
            <CardTitle>🎯 Resultado do Teste</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="bg-muted p-4 rounded-lg overflow-auto text-sm">
              {JSON.stringify(resultado, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>📋 Resultados Esperados</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <h4 className="font-semibold text-green-600">✅ Normalizações Corretas:</h4>
            <ul className="space-y-1 text-sm">
              <li><strong>"Creme Leite Italac 200g"</strong> → <strong>"Creme de Leite Italac 200g"</strong> (categoria: laticínios/frios)</li>
              <li><strong>"Chá Mate Matte Leão Natural 1,5L"</strong> → <strong>"Chá Pronto Matte Leão 1,5L Natural"</strong> (categoria: bebidas)</li>
              <li><strong>"Leite Integral Parmalat 1L"</strong> → categoria: laticínios/frios</li>
              <li><strong>"Pão de Forma Pullman 450g"</strong> → categoria: padaria</li>
            </ul>
          </div>
          
          <div className="space-y-2">
            <h4 className="font-semibold text-blue-600">🎯 Smart Matcher:</h4>
            <ul className="space-y-1 text-sm">
              <li>Deve encontrar matches entre produtos similares</li>
              <li>Deve criar novos produtos quando não há match</li>
              <li>Deve aplicar normalização IA-2 para novos produtos</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default TesteSistemaNormalizacao;