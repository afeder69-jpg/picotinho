import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Building2, Plus, Search, Edit3, Trash2, Loader2, RefreshCw, CheckCircle, ArrowRight, History } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { format } from "date-fns";

interface Normalizacao {
  id: string;
  nome_original: string;
  nome_normalizado: string;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

const NormalizacoesEstabelecimentos = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [normalizacoes, setNormalizacoes] = useState<Normalizacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Normalizacao | null>(null);
  const [submitting, setSubmitting] = useState(false);
  
  // Estado para normalização retroativa
  const [isRetroativaDialogOpen, setIsRetroativaDialogOpen] = useState(false);
  const [isAnaliseDialogOpen, setIsAnaliseDialogOpen] = useState(false);
  const [processandoRetroativa, setProcessandoRetroativa] = useState(false);
  const [progressoRetroativa, setProgressoRetroativa] = useState(0);
  const [analiseImpacto, setAnaliseImpacto] = useState<any>(null);
  const [relatorioRetroativa, setRelatorioRetroativa] = useState<any>(null);
  const [isRelatorioDialogOpen, setIsRelatorioDialogOpen] = useState(false);

  // Formulário
  const [formData, setFormData] = useState({
    nome_original: "",
    nome_normalizado: "",
    ativo: true,
  });

  useEffect(() => {
    verificarAcessoMaster();
    carregarNormalizacoes();
  }, []);

  const verificarAcessoMaster = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast({
        title: "Acesso negado",
        description: "Você precisa estar logado para acessar esta página.",
        variant: "destructive",
      });
      navigate("/");
      return;
    }

    // Verificar se é master usando a tabela user_roles
    const { data: roles, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "master")
      .maybeSingle();

    if (!roles || roleError) {
      toast({
        title: "Acesso negado",
        description: "Apenas usuários Master podem acessar esta página.",
        variant: "destructive",
      });
      navigate("/");
    }
  };

  const carregarNormalizacoes = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("normalizacoes_estabelecimentos")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      setNormalizacoes(data || []);
    } catch (error) {
      console.error("Erro ao carregar normalizações:", error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar as normalizações.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!formData.nome_original.trim() || !formData.nome_normalizado.trim()) {
      toast({
        title: "Campos obrigatórios",
        description: "Preencha o nome original e o nome normalizado.",
        variant: "destructive",
      });
      return;
    }

    try {
      setSubmitting(true);

      const nomeOriginalUpper = formData.nome_original.trim().toUpperCase();
      const nomeNormalizadoUpper = formData.nome_normalizado.trim().toUpperCase();

      if (editingItem) {
        // Atualizar
        const { error } = await supabase
          .from("normalizacoes_estabelecimentos")
          .update({
            nome_original: nomeOriginalUpper,
            nome_normalizado: nomeNormalizadoUpper,
            ativo: formData.ativo,
          })
          .eq("id", editingItem.id);

        if (error) throw error;

        toast({
          title: "Sucesso",
          description: "Normalização atualizada com sucesso!",
        });
      } else {
        // Criar nova
        const { error } = await supabase
          .from("normalizacoes_estabelecimentos")
          .insert({
            nome_original: nomeOriginalUpper,
            nome_normalizado: nomeNormalizadoUpper,
            ativo: formData.ativo,
          });

        if (error) throw error;

        toast({
          title: "Sucesso",
          description: "Normalização criada com sucesso!",
        });
      }

      setIsDialogOpen(false);
      resetForm();
      carregarNormalizacoes();
    } catch (error: any) {
      console.error("Erro ao salvar normalização:", error);
      
      if (error.code === "23505") {
        toast({
          title: "Erro",
          description: "Já existe uma normalização com este nome original.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Erro",
          description: "Não foi possível salvar a normalização.",
          variant: "destructive",
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (item: Normalizacao) => {
    setEditingItem(item);
    setFormData({
      nome_original: item.nome_original,
      nome_normalizado: item.nome_normalizado,
      ativo: item.ativo,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    try {
      // Soft delete - marcar como inativo
      const { error } = await supabase
        .from("normalizacoes_estabelecimentos")
        .update({ ativo: false })
        .eq("id", id);

      if (error) throw error;

      toast({
        title: "Sucesso",
        description: "Normalização removida com sucesso!",
      });

      carregarNormalizacoes();
    } catch (error) {
      console.error("Erro ao remover normalização:", error);
      toast({
        title: "Erro",
        description: "Não foi possível remover a normalização.",
        variant: "destructive",
      });
    }
  };

  const resetForm = () => {
    setFormData({
      nome_original: "",
      nome_normalizado: "",
      ativo: true,
    });
    setEditingItem(null);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    resetForm();
  };

  const analisarImpacto = async () => {
    try {
      setAnaliseImpacto(null);
      const { data, error } = await supabase.functions.invoke(
        'analisar-impacto-normalizacao'
      );

      if (error) throw error;

      setAnaliseImpacto(data);
      setIsAnaliseDialogOpen(true);
    } catch (error) {
      console.error('Erro ao analisar impacto:', error);
      toast({
        title: "Erro",
        description: "Não foi possível analisar o impacto das normalizações.",
        variant: "destructive",
      });
    }
  };

  const aplicarNormalizacaoRetroativa = async () => {
    try {
      setProcessandoRetroativa(true);
      setProgressoRetroativa(10);
      setIsAnaliseDialogOpen(false);
      setIsRetroativaDialogOpen(true);

      const { data, error } = await supabase.functions.invoke(
        'aplicar-normalizacao-retroativa'
      );

      setProgressoRetroativa(100);

      if (error) throw error;

      setRelatorioRetroativa(data.estatisticas);
      setIsRetroativaDialogOpen(false);
      setIsRelatorioDialogOpen(true);

      toast({
        title: "Sucesso!",
        description: `${data.estatisticas.notas_atualizadas} notas foram atualizadas.`,
      });

    } catch (error) {
      console.error('Erro ao aplicar normalizações:', error);
      toast({
        title: "Erro",
        description: "Não foi possível aplicar as normalizações retroativas.",
        variant: "destructive",
      });
    } finally {
      setProcessandoRetroativa(false);
      setProgressoRetroativa(0);
    }
  };

  const normalizacoesFiltradas = normalizacoes.filter((norm) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      norm.nome_original.toLowerCase().includes(searchLower) ||
      norm.nome_normalizado.toLowerCase().includes(searchLower)
    );
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <PageHeader title="Normalizações de Estabelecimentos" />

      <div className="container mx-auto p-4 max-w-4xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <Button
            variant="ghost"
            onClick={() => navigate("/admin/normalizacao")}
            className="gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar
          </Button>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={analisarImpacto}
              className="gap-2"
            >
              <History className="w-4 h-4" />
              Aplicar a Notas Antigas
            </Button>

            <Dialog open={isDialogOpen} onOpenChange={handleCloseDialog}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="w-4 h-4" />
                Nova Normalização
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingItem ? "Editar Normalização" : "Nova Normalização"}
                </DialogTitle>
                <DialogDescription>
                  Configure como os nomes de estabelecimentos devem ser normalizados no sistema.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="nome_original">Nome Original *</Label>
                  <Input
                    id="nome_original"
                    placeholder="Ex: SUPERMERCADO BARRA OESTE LIMITADA"
                    value={formData.nome_original}
                    onChange={(e) =>
                      setFormData({ ...formData, nome_original: e.target.value })
                    }
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Nome como aparece nas notas fiscais
                  </p>
                </div>

                <div>
                  <Label htmlFor="nome_normalizado">Nome Normalizado *</Label>
                  <Input
                    id="nome_normalizado"
                    placeholder="Ex: SUPERMARKET RECREIO"
                    value={formData.nome_normalizado}
                    onChange={(e) =>
                      setFormData({ ...formData, nome_normalizado: e.target.value })
                    }
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Nome que será exibido no sistema
                  </p>
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="ativo">Ativo</Label>
                  <Switch
                    id="ativo"
                    checked={formData.ativo}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, ativo: checked })
                    }
                  />
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={handleCloseDialog}>
                  Cancelar
                </Button>
                <Button onClick={handleSubmit} disabled={submitting}>
                  {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {editingItem ? "Salvar Alterações" : "Criar Normalização"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          </div>
        </div>

        {/* Dialog de Análise de Impacto */}
        <Dialog open={isAnaliseDialogOpen} onOpenChange={setIsAnaliseDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <History className="w-5 h-5" />
                Aplicar Normalizações a Notas Antigas
              </DialogTitle>
              <DialogDescription>
                Esta ação irá atualizar todas as notas fiscais já processadas para aplicar as novas regras de normalização de estabelecimentos.
              </DialogDescription>
            </DialogHeader>

            {analiseImpacto ? (
              <div className="space-y-4 my-4">
                <Card>
                  <CardContent className="pt-6">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Total de Notas</p>
                        <p className="text-3xl font-bold">{analiseImpacto.total_notas_processadas}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Notas a Atualizar</p>
                        <p className="text-3xl font-bold text-primary">{analiseImpacto.total_notas_afetadas}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {analiseImpacto.impacto && analiseImpacto.impacto.length > 0 && (
                  <div>
                    <h4 className="font-semibold mb-3">Normalizações que serão aplicadas:</h4>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {analiseImpacto.impacto.map((norm: any) => (
                        <div key={norm.id} className="flex items-center gap-2 text-sm p-2 bg-muted/50 rounded">
                          <ArrowRight className="w-3 h-3 flex-shrink-0" />
                          <span className="text-muted-foreground truncate flex-1">{norm.nome_original}</span>
                          <span>→</span>
                          <span className="font-medium truncate flex-1">{norm.nome_normalizado}</span>
                          <Badge variant="secondary">{norm.notas_afetadas} notas</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {analiseImpacto.total_notas_afetadas === 0 && (
                  <Card>
                    <CardContent className="py-6 text-center">
                      <p className="text-muted-foreground">
                        Nenhuma nota será afetada pelas normalizações ativas.
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAnaliseDialogOpen(false)}>
                Cancelar
              </Button>
              <Button 
                onClick={aplicarNormalizacaoRetroativa}
                disabled={!analiseImpacto || analiseImpacto.total_notas_afetadas === 0}
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Aplicar Normalizações
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog de Processamento */}
        <Dialog open={isRetroativaDialogOpen} onOpenChange={() => {}}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Processando Normalizações</DialogTitle>
              <DialogDescription>
                Aguarde enquanto atualizamos as notas fiscais...
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <Progress value={progressoRetroativa} />
              <p className="text-sm text-center text-muted-foreground">
                {progressoRetroativa < 100 ? 'Processando notas...' : 'Finalizando...'}
              </p>
            </div>
          </DialogContent>
        </Dialog>

        {/* Dialog de Relatório */}
        <Dialog open={isRelatorioDialogOpen} onOpenChange={setIsRelatorioDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-600" />
                Normalização Concluída com Sucesso!
              </DialogTitle>
            </DialogHeader>

            {relatorioRetroativa && (
              <Card>
                <CardContent className="pt-6">
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span>Notas analisadas:</span>
                      <span className="font-bold">{relatorioRetroativa.total_notas_analisadas}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Notas atualizadas:</span>
                      <span className="font-bold text-primary">{relatorioRetroativa.notas_atualizadas}</span>
                    </div>

                    {relatorioRetroativa.normalizacoes_aplicadas && relatorioRetroativa.normalizacoes_aplicadas.length > 0 && (
                      <>
                        <Separator />
                        <div>
                          <h5 className="font-semibold mb-2">Normalizações Aplicadas:</h5>
                          <div className="space-y-2 max-h-64 overflow-y-auto">
                            {relatorioRetroativa.normalizacoes_aplicadas.map((norm: any, idx: number) => (
                              <div key={idx} className="text-sm p-2 bg-muted/50 rounded">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-muted-foreground truncate flex-1">{norm.nome_original}</span>
                                  <span>→</span>
                                  <span className="font-medium truncate flex-1">{norm.nome_normalizado}</span>
                                </div>
                                <Badge variant="secondary" className="mt-1">{norm.quantidade_notas} notas</Badge>
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    )}

                    {relatorioRetroativa.notas_atualizadas === 0 && (
                      <>
                        <Separator />
                        <p className="text-sm text-muted-foreground text-center py-2">
                          Nenhuma nota precisou ser atualizada.
                        </p>
                      </>
                    )}

                    <Separator />
                    <div className="text-xs text-muted-foreground text-center">
                      Tempo de processamento: {relatorioRetroativa.tempo_processamento_segundos}s
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="justify-end">
                  <Button onClick={() => setIsRelatorioDialogOpen(false)}>
                    Fechar
                  </Button>
                </CardFooter>
              </Card>
            )}
          </DialogContent>
        </Dialog>

        {/* Busca */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar estabelecimentos..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Total de Normalizações</CardDescription>
              <CardTitle className="text-3xl">{normalizacoes.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Normalizações Ativas</CardDescription>
              <CardTitle className="text-3xl">
                {normalizacoes.filter((n) => n.ativo).length}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Lista */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : normalizacoesFiltradas.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Building2 className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">
                {searchTerm
                  ? "Nenhuma normalização encontrada com esses termos."
                  : "Nenhuma normalização cadastrada ainda."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {normalizacoesFiltradas.map((norm) => (
              <Card key={norm.id} className="transition-shadow hover:shadow-md">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <Building2 className="w-5 h-5 text-primary flex-shrink-0" />
                        <CardTitle className="text-lg truncate">
                          {norm.nome_original}
                        </CardTitle>
                        <Badge variant={norm.ativo ? "default" : "secondary"}>
                          {norm.ativo ? "Ativo" : "Inativo"}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span>→</span>
                        <span className="font-medium text-foreground">
                          {norm.nome_normalizado}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        Criado em {format(new Date(norm.created_at), "dd/MM/yyyy")}
                      </p>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => handleEdit(norm)}
                      >
                        <Edit3 className="w-4 h-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="icon">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Confirmar Remoção</AlertDialogTitle>
                            <AlertDialogDescription>
                              Tem certeza que deseja remover esta normalização?
                              <br />
                              <br />
                              <strong>{norm.nome_original}</strong> → {norm.nome_normalizado}
                              <br />
                              <br />
                              A normalização será marcada como inativa e não será mais aplicada em novas notas.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDelete(norm.id)}>
                              Remover
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default NormalizacoesEstabelecimentos;
