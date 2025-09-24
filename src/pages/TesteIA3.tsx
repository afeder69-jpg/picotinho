import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Bot, CheckCircle, AlertCircle, PlusCircle } from "lucide-react";

interface ResultadoIA3 {
  nome_original: string;
  nome_normalizado: string;
  sku: string | null;
  acao: "aceito_automatico" | "enviado_revisao" | "novo_sku_sugerido";
  score: number;
  categoria: string;
  marca: string | null;
  quantidade: string | null;
  unidade: string;
}

interface RespostaIA3 {
  success: boolean;
  resultado: ResultadoIA3;
  debug?: {
    prompt: string;
    resposta_bruta: string;
  };
}

export default function TesteIA3() {
  const [produtoNome, setProdutoNome] = useState("");
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState<RespostaIA3 | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const { toast } = useToast();

  const exemplosProdutos = [
    "cr. leite italac 200 gr",
    "refrig. coca cola 2l",
    "choc. nescau 380g",
    "sabonete dove 90g",
    "arroz uncle bens 1kg",
    "leite integral parmalat 1l",
    "pao forma wickbold 500g"
  ];

  async function testarIA3() {
    if (!produtoNome.trim()) {
      toast({
        title: "Erro",
        description: "Digite um nome de produto para testar",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    setErro(null);
    setResultado(null);

    try {
      const { data, error } = await supabase.functions.invoke('normalizar-produto-ia3', {
        body: {
          produto_nome: produtoNome.trim(),
          debug: true
        }
      });

      if (error) {
        throw error;
      }

      setResultado(data);
      toast({
        title: "IA3 executada com sucesso!",
        description: `Produto normalizado: ${data.resultado.nome_normalizado}`,
      });

    } catch (error: any) {
      console.error('Erro ao testar IA3:', error);
      setErro(error.message || 'Erro desconhecido');
      toast({
        title: "Erro ao executar IA3",
        description: error.message || "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  function getAcaoIcon(acao: string) {
    switch (acao) {
      case 'aceito_automatico':
        return <CheckCircle className="h-4 w-4" />;
      case 'enviado_revisao':
        return <AlertCircle className="h-4 w-4" />;
      case 'novo_sku_sugerido':
        return <PlusCircle className="h-4 w-4" />;
      default:
        return <Bot className="h-4 w-4" />;
    }
  }

  function getAcaoColor(acao: string) {
    switch (acao) {
      case 'aceito_automatico':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'enviado_revisao':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'novo_sku_sugerido':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  }

  function getScoreColor(score: number) {
    if (score >= 0.9) return 'bg-green-100 text-green-800 border-green-200';
    if (score >= 0.75) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    return 'bg-red-100 text-red-800 border-red-200';
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Teste da IA3 - Normalização de Produtos</h1>
        <p className="text-gray-600">
          Teste o novo sistema de normalização de produtos com prompt dedicado de IA
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            Teste da IA3
          </CardTitle>
          <CardDescription>
            Digite um nome de produto cru para normalizar usando a IA3
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="produto">Nome do Produto (cru)</Label>
            <Input
              id="produto"
              type="text"
              value={produtoNome}
              onChange={(e) => setProdutoNome(e.target.value)}
              placeholder="Ex: cr. leite italac 200 gr"
              disabled={loading}
            />
          </div>

          <Button 
            onClick={testarIA3} 
            disabled={loading || !produtoNome.trim()}
            className="w-full"
          >
            {loading ? "Processando com IA3..." : "Executar IA3"}
          </Button>

          <div>
            <Label>Exemplos para teste:</Label>
            <div className="flex flex-wrap gap-2 mt-2">
              {exemplosProdutos.map((exemplo, index) => (
                <Button
                  key={index}
                  variant="outline"
                  size="sm"
                  onClick={() => setProdutoNome(exemplo)}
                  disabled={loading}
                >
                  {exemplo}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {erro && (
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="text-red-800">Erro</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-red-700">{erro}</p>
          </CardContent>
        </Card>
      )}

      {resultado && (
        <Card>
          <CardHeader>
            <CardTitle>Resultado da IA3</CardTitle>
            <CardDescription>
              Normalização processada com sucesso
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Nome Original</Label>
                <p className="text-sm bg-gray-100 p-2 rounded">{resultado.resultado.nome_original}</p>
              </div>
              <div>
                <Label>Nome Normalizado</Label>
                <p className="text-sm bg-green-100 p-2 rounded font-medium">{resultado.resultado.nome_normalizado}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>Ação</Label>
                <div className="mt-1">
                  <Badge className={`${getAcaoColor(resultado.resultado.acao)} flex items-center gap-1`}>
                    {getAcaoIcon(resultado.resultado.acao)}
                    {resultado.resultado.acao.replace('_', ' ')}
                  </Badge>
                </div>
              </div>
              <div>
                <Label>Score de Confiança</Label>
                <div className="mt-1">
                  <Badge className={getScoreColor(resultado.resultado.score)}>
                    {(resultado.resultado.score * 100).toFixed(1)}%
                  </Badge>
                </div>
              </div>
              <div>
                <Label>SKU</Label>
                <p className="text-sm bg-gray-100 p-2 rounded mt-1">
                  {resultado.resultado.sku || 'Nenhum SKU associado'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <Label>Categoria</Label>
                <p className="text-sm bg-blue-100 p-2 rounded mt-1">{resultado.resultado.categoria}</p>
              </div>
              <div>
                <Label>Marca</Label>
                <p className="text-sm bg-purple-100 p-2 rounded mt-1">{resultado.resultado.marca || 'Não detectada'}</p>
              </div>
              <div>
                <Label>Quantidade</Label>
                <p className="text-sm bg-orange-100 p-2 rounded mt-1">{resultado.resultado.quantidade || 'Não detectada'}</p>
              </div>
              <div>
                <Label>Unidade</Label>
                <p className="text-sm bg-teal-100 p-2 rounded mt-1">{resultado.resultado.unidade}</p>
              </div>
            </div>

            {resultado.debug && (
              <div className="space-y-4">
                <div>
                  <Label>Prompt Enviado para IA</Label>
                  <Textarea
                    value={resultado.debug.prompt}
                    readOnly
                    className="h-32 text-xs"
                  />
                </div>
                <div>
                  <Label>Resposta Bruta da IA</Label>
                  <Textarea
                    value={resultado.debug.resposta_bruta}
                    readOnly
                    className="h-20 text-xs"
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}