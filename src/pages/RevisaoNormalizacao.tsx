import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, XCircle, Plus, Eye, Filter } from "lucide-react";

interface Proposta {
  id: string;
  texto_origem: string;
  fonte: string;
  candidatos: any;
  score_melhor: number;
  status: string;
  created_at: string;
}

interface ProdutoNovo {
  nome_normalizado: string;
  marca: string;
  categoria: string;
  variante: string;
  descricao: string;
}

export default function RevisaoNormalizacao() {
  const [propostas, setPropostas] = useState<Proposta[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState("pendente");
  const [filtroScore, setFiltroScore] = useState("0.9");
  const [produtoNovo, setProdutoNovo] = useState<ProdutoNovo>({
    nome_normalizado: "",
    marca: "",
    categoria: "outros",
    variante: "",
    descricao: ""
  });
  const [showNovoDialog, setShowNovoDialog] = useState(false);
  const [propostaAtual, setPropostaAtual] = useState<Proposta | null>(null);
  const { toast } = useToast();

  const categorias = [
    "alimentos", "bebidas", "limpeza", "higiene", "casa", "eletronicos", "roupas", "outros"
  ];

  useEffect(() => {
    carregarPropostas();
  }, [filtroStatus, filtroScore]);

  const carregarPropostas = async () => {
    try {
      let query = supabase
        .from("propostas_revisao")
        .select("*")
        .order("score_melhor", { ascending: false })
        .order("created_at", { ascending: false });

      if (filtroStatus !== "todos") {
        query = query.eq("status", filtroStatus);
      }

      if (filtroScore) {
        const score = parseFloat(filtroScore);
        query = query.gte("score_melhor", score);
      }

      const { data, error } = await query.limit(50);

      if (error) throw error;
      setPropostas(data || []);
    } catch (error) {
      console.error("Erro ao carregar propostas:", error);
      toast({
        title: "Erro",
        description: "Erro ao carregar propostas de revisão",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const aprovarProposta = async (propostaId: string, produtoEscolhidoId: string) => {
    try {
      const { error } = await supabase
        .from("propostas_revisao")
        .update({
          status: "aprovado",
          produto_escolhido_id: produtoEscolhidoId,
          updated_at: new Date().toISOString()
        })
        .eq("id", propostaId);

      if (error) throw error;

      // Criar sinônimo
      const proposta = propostas.find(p => p.id === propostaId);
      if (proposta) {
        await supabase
          .from("sinonimos_produtos")
          .insert({
            produto_id: produtoEscolhidoId,
            texto_origem: proposta.texto_origem,
            fonte: proposta.fonte,
            confianca: proposta.score_melhor,
            metodo_criacao: "revisao"
          });
      }

      toast({
        title: "Sucesso",
        description: "Proposta aprovada e sinônimo criado",
      });

      carregarPropostas();
    } catch (error) {
      console.error("Erro ao aprovar proposta:", error);
      toast({
        title: "Erro",
        description: "Erro ao aprovar proposta",
        variant: "destructive",
      });
    }
  };

  const rejeitarProposta = async (propostaId: string, observacoes?: string) => {
    try {
      const { error } = await supabase
        .from("propostas_revisao")
        .update({
          status: "rejeitado",
          observacoes,
          updated_at: new Date().toISOString()
        })
        .eq("id", propostaId);

      if (error) throw error;

      toast({
        title: "Sucesso",
        description: "Proposta rejeitada",
      });

      carregarPropostas();
    } catch (error) {
      console.error("Erro ao rejeitar proposta:", error);
      toast({
        title: "Erro",
        description: "Erro ao rejeitar proposta",
        variant: "destructive",
      });
    }
  };

  const criarNovoProduto = async () => {
    if (!propostaAtual || !produtoNovo.nome_normalizado) {
      toast({
        title: "Erro",
        description: "Nome normalizado é obrigatório",
        variant: "destructive",
      });
      return;
    }

    try {
      // Criar novo produto
      const novoSku = `SKU-${Date.now().toString(36).toUpperCase()}`;
      
      const { data: produto, error: produtoError } = await supabase
        .from("produtos_normalizados")
        .insert({
          sku: novoSku,
          nome_normalizado: produtoNovo.nome_normalizado,
          nome_padrao: produtoNovo.nome_normalizado, // Campo obrigatório no schema atual
          marca: produtoNovo.marca || null,
          categoria: produtoNovo.categoria,
          unidade_medida: "unidade", // Campo obrigatório no schema atual
          variante: produtoNovo.variante || null,
          descricao: produtoNovo.descricao || null,
          provisorio: false
        })
        .select()
        .single();

      if (produtoError) throw produtoError;

      // Atualizar proposta
      const { error: propostaError } = await supabase
        .from("propostas_revisao")
        .update({
          status: "criado_novo",
          produto_escolhido_id: produto.id,
          novo_produto: produtoNovo as any,
          updated_at: new Date().toISOString()
        })
        .eq("id", propostaAtual.id);

      if (propostaError) throw propostaError;

      // Criar sinônimo
      await supabase
        .from("sinonimos_produtos")
        .insert({
          produto_id: produto.id,
          texto_origem: propostaAtual.texto_origem,
          fonte: propostaAtual.fonte,
          confianca: 1.0,
          metodo_criacao: "revisao"
        });

      toast({
        title: "Sucesso",
        description: `Novo produto criado: ${novoSku}`,
      });

      setShowNovoDialog(false);
      setProdutoNovo({
        nome_normalizado: "",
        marca: "",
        categoria: "outros",
        variante: "",
        descricao: ""
      });
      setPropostaAtual(null);
      carregarPropostas();
    } catch (error) {
      console.error("Erro ao criar produto:", error);
      toast({
        title: "Erro",
        description: "Erro ao criar novo produto",
        variant: "destructive",
      });
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 0.9) return "bg-green-100 text-green-800";
    if (score >= 0.75) return "bg-yellow-100 text-yellow-800";
    return "bg-red-100 text-red-800";
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pendente": return "bg-blue-100 text-blue-800";
      case "aprovado": return "bg-green-100 text-green-800";
      case "rejeitado": return "bg-red-100 text-red-800";
      case "criado_novo": return "bg-purple-100 text-purple-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-lg">Carregando propostas...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Revisão de Normalização</h1>
          <p className="text-muted-foreground">
            Revise e aprove propostas de normalização de produtos
          </p>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4" />
            <Select value={filtroStatus} onValueChange={setFiltroStatus}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="aprovado">Aprovado</SelectItem>
                <SelectItem value="rejeitado">Rejeitado</SelectItem>
                <SelectItem value="criado_novo">Novo</SelectItem>
                <SelectItem value="todos">Todos</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <Input
            placeholder="Score mínimo"
            value={filtroScore}
            onChange={(e) => setFiltroScore(e.target.value)}
            className="w-32"
            type="number"
            step="0.1"
            min="0"
            max="1"
          />
        </div>
      </div>

      {propostas.length === 0 ? (
        <Card>
          <CardContent className="flex items-center justify-center h-32">
            <p className="text-muted-foreground">Nenhuma proposta encontrada</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {propostas.map((proposta) => (
            <Card key={proposta.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">{proposta.texto_origem}</CardTitle>
                    <CardDescription>
                      Fonte: {proposta.fonte} • {new Date(proposta.created_at).toLocaleDateString()}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={getScoreColor(proposta.score_melhor)}>
                      Score: {(proposta.score_melhor * 100).toFixed(1)}%
                    </Badge>
                    <Badge className={getStatusColor(proposta.status)}>
                      {proposta.status}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <h4 className="font-medium mb-2">Candidatos encontrados:</h4>
                    <div className="grid gap-2">
                      {Array.isArray(proposta.candidatos) ? proposta.candidatos.slice(0, 3).map((candidato: any, index: number) => (
                        <div
                          key={candidato.id || index}
                          className="flex items-center justify-between p-3 border rounded-lg"
                        >
                          <div>
                            <div className="font-medium">{candidato.nome_normalizado}</div>
                            <div className="text-sm text-muted-foreground">
                              {candidato.marca && `${candidato.marca} • `}
                              {candidato.categoria}
                              {candidato.variante && ` • ${candidato.variante}`}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              SKU: {candidato.sku}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">
                              {((candidato.score_agregado || candidato.score || 0) * 100).toFixed(1)}%
                            </Badge>
                            {proposta.status === "pendente" && (
                              <Button
                                size="sm"
                                onClick={() => aprovarProposta(proposta.id, candidato.id)}
                                className="gap-1"
                              >
                                <CheckCircle className="h-3 w-3" />
                                Aprovar
                              </Button>
                            )}
                          </div>
                        </div>
                      )) : null}
                    </div>
                  </div>

                  {proposta.status === "pendente" && (
                    <div className="flex items-center gap-2 pt-2 border-t">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => rejeitarProposta(proposta.id)}
                        className="gap-1"
                      >
                        <XCircle className="h-3 w-3" />
                        Rejeitar
                      </Button>
                      
                      <Dialog open={showNovoDialog} onOpenChange={setShowNovoDialog}>
                        <DialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setPropostaAtual(proposta);
                              setProdutoNovo({
                                nome_normalizado: proposta.texto_origem,
                                marca: "",
                                categoria: "outros",
                                variante: "",
                                descricao: ""
                              });
                            }}
                            className="gap-1"
                          >
                            <Plus className="h-3 w-3" />
                            Criar Novo
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-md">
                          <DialogHeader>
                            <DialogTitle>Criar Novo Produto</DialogTitle>
                            <DialogDescription>
                              Criar um novo produto normalizado para "{propostaAtual?.texto_origem}"
                            </DialogDescription>
                          </DialogHeader>
                          
                          <div className="space-y-4">
                            <div>
                              <Label htmlFor="nome_normalizado">Nome Normalizado *</Label>
                              <Input
                                id="nome_normalizado"
                                value={produtoNovo.nome_normalizado}
                                onChange={(e) => setProdutoNovo(prev => ({
                                  ...prev,
                                  nome_normalizado: e.target.value
                                }))}
                                placeholder="Ex: Creme de Leite Italac 200g"
                              />
                            </div>
                            
                            <div>
                              <Label htmlFor="marca">Marca</Label>
                              <Input
                                id="marca"
                                value={produtoNovo.marca}
                                onChange={(e) => setProdutoNovo(prev => ({
                                  ...prev,
                                  marca: e.target.value
                                }))}
                                placeholder="Ex: Italac"
                              />
                            </div>
                            
                            <div>
                              <Label htmlFor="categoria">Categoria</Label>
                              <Select
                                value={produtoNovo.categoria}
                                onValueChange={(value) => setProdutoNovo(prev => ({
                                  ...prev,
                                  categoria: value
                                }))}
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {categorias.map(cat => (
                                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            
                            <div>
                              <Label htmlFor="variante">Variante</Label>
                              <Input
                                id="variante"
                                value={produtoNovo.variante}
                                onChange={(e) => setProdutoNovo(prev => ({
                                  ...prev,
                                  variante: e.target.value
                                }))}
                                placeholder="Ex: 200g, 1.5L"
                              />
                            </div>
                            
                            <div>
                              <Label htmlFor="descricao">Descrição</Label>
                              <Textarea
                                id="descricao"
                                value={produtoNovo.descricao}
                                onChange={(e) => setProdutoNovo(prev => ({
                                  ...prev,
                                  descricao: e.target.value
                                }))}
                                placeholder="Descrição opcional do produto"
                                rows={3}
                              />
                            </div>
                            
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="outline"
                                onClick={() => setShowNovoDialog(false)}
                              >
                                Cancelar
                              </Button>
                              <Button onClick={criarNovoProduto}>
                                Criar Produto
                              </Button>
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}