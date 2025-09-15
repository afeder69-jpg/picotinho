import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Trash2, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export default function CleanupUserData() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [error, setError] = useState<string>('');
  const [isPageLoaded, setIsPageLoaded] = useState(false);

  useEffect(() => {
    console.log('🔧 Página CleanupUserData carregada');
    setIsPageLoaded(true);
  }, []);

  const handleCleanup = async () => {
    if (!email.trim()) {
      toast.error('Digite o email do usuário');
      return;
    }

    console.log('🚀 Iniciando limpeza para:', email.trim());
    setIsLoading(true);
    setError('');
    setResults(null);
    
    try {
      console.log('📡 Invocando edge function...');
      
      // Timeout de 60 segundos
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Timeout: operação demorou mais de 60 segundos')), 60000);
      });
      
      const cleanupPromise = supabase.functions.invoke('cleanup-user-data', {
        body: { email: email.trim() }
      });
      
      const { data, error } = await Promise.race([cleanupPromise, timeoutPromise]) as any;

      console.log('📨 Resposta recebida:', { data, error });

      if (error) {
        console.error('❌ Erro da edge function:', error);
        setError(`Erro da Edge Function: ${error.message || 'Erro desconhecido'}`);
        throw error;
      }

      if (!data) {
        console.error('❌ Nenhum dado retornado da edge function');
        setError('Nenhum dado retornado da função de limpeza');
        throw new Error('Nenhum dado retornado');
      }

      console.log('✅ Dados recebidos:', data);
      setResults(data);
      toast.success('Limpeza realizada com sucesso!');
    } catch (error: any) {
      console.error('🔥 Erro capturado:', error);
      const errorMessage = error.message || 'Erro desconhecido durante a limpeza';
      setError(errorMessage);
      toast.error(`Erro: ${errorMessage}`);
    } finally {
      console.log('🏁 Finalizando operação...');
      setIsLoading(false);
    }
  };

  if (!isPageLoaded) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p>Carregando página de limpeza...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <Card className="border-destructive/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Limpeza Completa de Dados
            </CardTitle>
            <CardDescription>
              Remove TODOS os dados de um usuário específico do banco de dados.
              Esta ação é irreversível!
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium">Email do usuário:</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="usuario@exemplo.com"
                className="mt-1"
              />
            </div>
            
            <Button 
              onClick={handleCleanup}
              disabled={isLoading}
              variant="destructive"
              className="w-full"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {isLoading ? 'Limpando...' : 'Executar Limpeza Completa'}
            </Button>
          </CardContent>
        </Card>

        {error && (
          <Card className="border-destructive">
            <CardHeader>
              <CardTitle className="text-destructive">Erro na Limpeza</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-destructive text-sm">{error}</p>
            </CardContent>
          </Card>
        )}

        {isLoading && (
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-center space-x-2">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                <span>Executando limpeza... Isso pode levar alguns minutos.</span>
              </div>
            </CardContent>
          </Card>
        )}

        {results && (
          <Card>
            <CardHeader>
              <CardTitle className="text-green-600">Resultados da Limpeza</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <p><strong>Usuário:</strong> {results.userId}</p>
                <p><strong>Email:</strong> {email}</p>
                
                <div className="bg-muted p-3 rounded">
                  <h4 className="font-medium mb-2">Resumo:</h4>
                  <ul className="text-sm space-y-1">
                    <li>Total de tabelas: {results.resumo?.total_tabelas}</li>
                    <li className="text-green-600">Sucessos: {results.resumo?.sucesso}</li>
                    <li className="text-red-600">Erros: {results.resumo?.erros}</li>
                  </ul>
                </div>

                <div className="bg-muted p-3 rounded">
                  <h4 className="font-medium mb-2">Detalhes por Tabela:</h4>
                  <div className="text-sm space-y-1">
                    {results.resultados?.map((result: any, index: number) => (
                      <div key={index} className="flex justify-between">
                        <span>{result.table}</span>
                        <span className={result.status === 'ok' || result.status === 'resetado' ? 'text-green-600' : 'text-red-600'}>
                          {result.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}