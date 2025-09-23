import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Brain, CheckCircle, AlertCircle, PlusCircle } from "lucide-react";

interface ResultadoNormalizacao {
  sku?: string;
  produto_id?: string;
  acao: string;
  score: number;
  candidatos: any[];
  confianca: string;
  proposta_id?: string;
}

export default function TesteNormalizacao() {
  const [textoTeste, setTextoTeste] = useState("");
  const [fonte, setFonte] = useState("teste_ui");
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState<ResultadoNormalizacao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const { toast } = useToast();

  const exemplos = [
    "creme de leite italac 200 gramas",
    "cha mate leao 1,5 litros",
    "sabao em po omo 1kg",
    "queijo parmesao president ralado",
    "chocolate nestle ao leite"
  ];

  const testarNormalizacao = async () => {
    if (!textoTeste.trim()) {
      toast({
        title: "Erro",
        description: "Digite um texto para testar",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    setErro(null);
    setResultado(null);

    try {
      const { data, error } = await supabase.functions.invoke('normalizar-produto', {
        body: {
          texto_origem: textoTeste,
          fonte: fonte,
          meta: {
            teste: true,
            timestamp: new Date().toISOString()
          }
        }
      });

      if (error) {
        throw error;
      }

      setResultado(data);
      toast({
        title: "Sucesso",
        description: `Normalização concluída: ${data.acao}`,
      });

    } catch (error: any) {
      console.error('Erro na normalização:', error);
      setErro(error.message || 'Erro desconhecido');
      toast({
        title: "Erro",
        description: "Erro ao executar normalização",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getAcaoIcon = (acao: string) => {
    switch (acao) {
      case 'auto_associado': return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'proposto': return <AlertCircle className="h-4 w-4 text-yellow-600" />;
      case 'novo_provisorio': return <PlusCircle className="h-4 w-4 text-blue-600" />;
      default: return <Brain className="h-4 w-4" />;
    }
  };

  const getAcaoColor = (acao: string) => {
    switch (acao) {
      case 'auto_associado': return 'bg-green-100 text-green-800';
      case 'proposto': return 'bg-yellow-100 text-yellow-800';
      case 'novo_provisorio': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getConfiancaColor = (confianca: string) => {
    switch (confianca) {
      case 'alta': return 'bg-green-100 text-green-800';
      case 'media': return 'bg-yellow-100 text-yellow-800';
      case 'baixa': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Teste de Normalização de Produtos</h1>
        <p className="text-muted-foreground">
          Teste a função de normalização com diferentes nomes de produtos
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            Testar Normalização
          </CardTitle>
          <CardDescription>
            Digite o nome de um produto para testar a normalização com IA
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="texto">Nome do Produto</Label>
            <Input
              id="texto"
              value={textoTeste}
              onChange={(e) => setTextoTeste(e.target.value)}
              placeholder="Ex: creme de leite italac 200g"
              disabled={loading}
            />
          </div>

          <div>
            <Label htmlFor="fonte">Fonte</Label>
            <Input
              id="fonte"
              value={fonte}
              onChange={(e) => setFonte(e.target.value)}
              placeholder="Ex: teste_ui, nota_fiscal, manual"
              disabled={loading}
            />
          </div>

          <div>
            <Label>Exemplos para testar:</Label>
            <div className="flex flex-wrap gap-2 mt-2">
              {exemplos.map((exemplo, index) => (
                <Button
                  key={index}
                  variant="outline"
                  size="sm"
                  onClick={() => setTextoTeste(exemplo)}
                  disabled={loading}
                >
                  {exemplo}
                </Button>
              ))}
            </div>
          </div>

          <Button 
            onClick={testarNormalizacao} 
            disabled={loading || !textoTeste.trim()}
            className="w-full"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processando...
              </>
            ) : (
              <>
                <Brain className="mr-2 h-4 w-4" />
                Testar Normalização
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {erro && (
        <Card className="border-red-200">
          <CardHeader>
            <CardTitle className="text-red-600 flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Erro
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-red-600">{erro}</p>
          </CardContent>
        </Card>
      )}

      {resultado && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {getAcaoIcon(resultado.acao)}
              Resultado da Normalização
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>Ação Tomada</Label>
                <div className="mt-1">
                  <Badge className={getAcaoColor(resultado.acao)}>
                    {resultado.acao}
                  </Badge>
                </div>
              </div>
              
              <div>
                <Label>Confiança</Label>
                <div className="mt-1">
                  <Badge className={getConfiancaColor(resultado.confianca)}>
                    {resultado.confianca}
                  </Badge>
                </div>
              </div>
              
              <div>
                <Label>Score</Label>
                <div className="mt-1">
                  <Badge variant="outline">
                    {(resultado.score * 100).toFixed(1)}%
                  </Badge>
                </div>
              </div>
            </div>

            {resultado.sku && (
              <div>
                <Label>SKU Gerado/Encontrado</Label>
                <div className="mt-1">
                  <code className="px-2 py-1 bg-muted rounded text-sm">
                    {resultado.sku}
                  </code>
                </div>
              </div>
            )}

            {resultado.proposta_id && (
              <div>
                <Label>ID da Proposta</Label>
                <p className="text-sm text-muted-foreground mt-1">
                  Proposta criada para revisão manual: {resultado.proposta_id}
                </p>
              </div>
            )}

            {resultado.candidatos && resultado.candidatos.length > 0 && (
              <div>
                <Label>Candidatos Encontrados ({resultado.candidatos.length})</Label>
                <div className="mt-2 space-y-2">
                  {resultado.candidatos.slice(0, 5).map((candidato, index) => (
                    <div
                      key={candidato.id || index}
                      className="p-3 border rounded-lg bg-muted/30"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium">
                            {candidato.nome_normalizado}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {candidato.marca && `${candidato.marca} • `}
                            {candidato.categoria}
                            {candidato.variante && ` • ${candidato.variante}`}
                          </div>
                          {candidato.sku && (
                            <div className="text-xs text-muted-foreground">
                              SKU: {candidato.sku}
                            </div>
                          )}
                        </div>
                        <Badge variant="outline">
                          {((candidato.score_agregado || candidato.score || 0) * 100).toFixed(1)}%
                        </Badge>
                      </div>
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