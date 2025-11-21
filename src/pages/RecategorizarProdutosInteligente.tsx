import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle, XCircle, ArrowRight } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Mudanca {
  produto_nome: string;
  categoria_anterior: string;
  categoria_nova: string;
  razao: string;
  status: 'sucesso' | 'erro';
}

interface ResultadoRecategorizacao {
  sucesso: boolean;
  produtos_analisados: number;
  produtos_recategorizados: number;
  produtos_mantidos: number;
  mudancas: Mudanca[];
  timestamp: string;
}

const RecategorizarProdutosInteligente = () => {
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState<ResultadoRecategorizacao | null>(null);
  const { toast } = useToast();

  const executarRecategorizacao = async () => {
    try {
      setLoading(true);
      setResultado(null);

      console.log("🚀 Executando recategorização inteligente...");

      const { data, error } = await supabase.functions.invoke(
        "recategorizar-produtos-inteligente",
        {
          body: {}
        }
      );

      if (error) {
        throw error;
      }

      console.log("✅ Recategorização concluída:", data);
      setResultado(data);

      toast({
        title: "Recategorização concluída!",
        description: `${data.produtos_recategorizados} produtos foram recategorizados de ${data.produtos_analisados} analisados.`,
      });
    } catch (error) {
      console.error("❌ Erro na recategorização:", error);
      toast({
        title: "Erro na recategorização",
        description: error.message || "Ocorreu um erro ao recategorizar os produtos.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <PageHeader title="Recategorização Inteligente" />
      
      <div className="container mx-auto p-4 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Recategorização Automática de Produtos</CardTitle>
            <CardDescription>
              Esta ferramenta corrige automaticamente as categorias de produtos baseado em regras inteligentes
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <h3 className="font-semibold text-sm">Categorias que serão corrigidas:</h3>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">Leite condensado → Mercearia</Badge>
                <Badge variant="outline">Chocolate → Mercearia</Badge>
                <Badge variant="outline">Creme de leite → Mercearia</Badge>
                <Badge variant="outline">Manteiga → Padaria</Badge>
                <Badge variant="outline">Geleia → Mercearia</Badge>
                <Badge variant="outline">Gelatina → Mercearia</Badge>
                <Badge variant="outline">Goiabada → Mercearia</Badge>
                <Badge variant="outline">Flocão → Mercearia</Badge>
                <Badge variant="outline">Abacate → Hortifruti</Badge>
                <Badge variant="outline">Mamão → Hortifruti</Badge>
                <Badge variant="outline">Rúcula → Hortifruti</Badge>
                <Badge variant="outline">Chá pronto → Bebidas</Badge>
              </div>
            </div>

            <Button 
              onClick={executarRecategorizacao} 
              disabled={loading}
              className="w-full"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Recategorizando...
                </>
              ) : (
                "Executar Recategorização Inteligente"
              )}
            </Button>
          </CardContent>
        </Card>

        {resultado && (
          <Card>
            <CardHeader>
              <CardTitle>Resultado da Recategorização</CardTitle>
              <CardDescription>
                Executado em {new Date(resultado.timestamp).toLocaleString('pt-BR')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-primary">{resultado.produtos_analisados}</p>
                      <p className="text-sm text-muted-foreground">Analisados</p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-green-600">{resultado.produtos_recategorizados}</p>
                      <p className="text-sm text-muted-foreground">Recategorizados</p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-muted-foreground">{resultado.produtos_mantidos}</p>
                      <p className="text-sm text-muted-foreground">Mantidos</p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {resultado.mudancas && resultado.mudancas.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-3">Mudanças Realizadas:</h3>
                  <div className="border rounded-lg">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Produto</TableHead>
                          <TableHead>Categoria Anterior</TableHead>
                          <TableHead className="w-12"></TableHead>
                          <TableHead>Categoria Nova</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {resultado.mudancas.map((mudanca, index) => (
                          <TableRow key={index}>
                            <TableCell className="font-medium">{mudanca.produto_nome}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{mudanca.categoria_anterior}</Badge>
                            </TableCell>
                            <TableCell>
                              <ArrowRight className="h-4 w-4 text-muted-foreground" />
                            </TableCell>
                            <TableCell>
                              <Badge variant="default">{mudanca.categoria_nova}</Badge>
                            </TableCell>
                            <TableCell>
                              {mudanca.status === 'sucesso' ? (
                                <CheckCircle className="h-4 w-4 text-green-600" />
                              ) : (
                                <XCircle className="h-4 w-4 text-red-600" />
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {resultado.mudancas && resultado.mudancas.length === 0 && (
                <Card className="bg-muted">
                  <CardContent className="pt-6">
                    <p className="text-center text-muted-foreground">
                      Nenhum produto precisou ser recategorizado. Todas as categorias já estão corretas! ✅
                    </p>
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default RecategorizarProdutosInteligente;
