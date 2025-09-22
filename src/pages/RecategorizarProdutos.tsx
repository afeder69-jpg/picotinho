import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, CheckCircle, AlertCircle } from "lucide-react";

export default function RecategorizarProdutos() {
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState<any>(null);
  const { toast } = useToast();

  const executarRecategorizacao = async () => {
    setLoading(true);
    setResultado(null);

    try {
      const { data, error } = await supabase.functions.invoke('recategorizar-produtos-outros');

      if (error) {
        throw error;
      }

      setResultado(data);
      
      if (data.success) {
        toast({
          title: "Recategorização concluída!",
          description: `${data.produtosRecategorizados} produtos foram recategorizados corretamente.`,
        });
      } else {
        throw new Error(data.error || 'Erro desconhecido');
      }
    } catch (error: any) {
      console.error('Erro na recategorização:', error);
      toast({
        title: "Erro na recategorização",
        description: error.message || "Erro ao recategorizar produtos",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Recategorizar Produtos</h1>
          <p className="text-muted-foreground mt-2">
            Corrige automaticamente produtos categorizados incorretamente como "OUTROS"
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Recategorização Automática
          </CardTitle>
          <CardDescription>
            Esta função irá analisar todos os produtos na categoria "OUTROS" e recategorizá-los 
            automaticamente para as categorias corretas baseado em regras inteligentes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <h3 className="font-semibold">Categorias que serão corrigidas:</h3>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">Tempero Verde → HORTIFRUTI</Badge>
              <Badge variant="secondary">Milho Verde → MERCEARIA</Badge>
              <Badge variant="secondary">Esponja de Aço → LIMPEZA</Badge>
              <Badge variant="secondary">Massa/Macarrão → MERCEARIA</Badge>
              <Badge variant="secondary">Sal → MERCEARIA</Badge>
              <Badge variant="secondary">Aveia → MERCEARIA</Badge>
              <Badge variant="secondary">Azeite → MERCEARIA</Badge>
              <Badge variant="secondary">Ovos → MERCEARIA</Badge>
            </div>
          </div>

          <Button 
            onClick={executarRecategorizacao} 
            disabled={loading}
            className="w-full"
          >
            {loading ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Recategorizando produtos...
              </>
            ) : (
              <>
                <CheckCircle className="mr-2 h-4 w-4" />
                Executar Recategorização
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {resultado && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {resultado.success ? (
                <CheckCircle className="h-5 w-5 text-green-600" />
              ) : (
                <AlertCircle className="h-5 w-5 text-red-600" />
              )}
              Resultado da Recategorização
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold text-center">
                    {resultado.totalProdutos}
                  </div>
                  <p className="text-xs text-muted-foreground text-center">
                    Total analisados
                  </p>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold text-center text-green-600">
                    {resultado.produtosRecategorizados}
                  </div>
                  <p className="text-xs text-muted-foreground text-center">
                    Recategorizados
                  </p>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold text-center text-gray-600">
                    {resultado.produtosMantidos}
                  </div>
                  <p className="text-xs text-muted-foreground text-center">
                    Mantidos em "OUTROS"
                  </p>
                </CardContent>
              </Card>
            </div>

            {resultado.detalhes && resultado.detalhes.length > 0 && (
              <div className="space-y-2">
                <h3 className="font-semibold">Detalhes das mudanças:</h3>
                <div className="space-y-1 max-h-60 overflow-y-auto">
                  {resultado.detalhes.map((detalhe: any, index: number) => (
                    <div key={index} className="flex items-center justify-between p-2 bg-muted rounded-lg">
                      <span className="font-medium">{detalhe.produto}</span>
                      <Badge variant="outline">
                        {detalhe.categoriaAnterior} → {detalhe.categoriaNova}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}