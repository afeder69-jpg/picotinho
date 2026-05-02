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
import { normalizarParaBusca } from "@/lib/utils";
import { ArrowLeft, Building2, Plus, Search, Edit3, Trash2, Loader2, RefreshCw, CheckCircle, ArrowRight, History, FileText, Copy } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { format } from "date-fns";

interface Normalizacao {
  id: string;
  nome_original: string;
  nome_normalizado: string;
  cnpj_original?: string | null;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

interface EstabelecimentoPendente {
  nome_estabelecimento: string;
  cnpj_estabelecimento: string | null;
  total_notas: number;
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
  const [limpandoDuplicatas, setLimpandoDuplicatas] = useState(false);
  
  // Estado para estabelecimentos pendentes
  const [pendentes, setPendentes] = useState<EstabelecimentoPendente[]>([]);
  const [loadingPendentes, setLoadingPendentes] = useState(true);
  const [pendentesBusca, setPendentesBusca] = useState<EstabelecimentoPendente[]>([]);

  // Estado para normalização retroativa
  const [isRetroativaDialogOpen, setIsRetroativaDialogOpen] = useState(false);
  const [isAnaliseDialogOpen, setIsAnaliseDialogOpen] = useState(false);
  const [processandoRetroativa, setProcessandoRetroativa] = useState(false);
  const [progressoRetroativa, setProgressoRetroativa] = useState(0);
  const [analisandoImpacto, setAnalisandoImpacto] = useState(false);
  const [analiseImpacto, setAnaliseImpacto] = useState<any>(null);
  const [relatorioRetroativa, setRelatorioRetroativa] = useState<any>(null);
  const [isRelatorioDialogOpen, setIsRelatorioDialogOpen] = useState(false);

  // Formulário
  const [formData, setFormData] = useState({
    nome_original: "",
    nome_normalizado: "",
    cnpj_original: "",
    ativo: true,
  });

  useEffect(() => {
    verificarAcessoMaster();
    carregarNormalizacoes();
    carregarPendentes();
  }, []);

  // Busca com debounce nos pendentes
  useEffect(() => {
    if (!searchTerm.trim()) {
      setPendentesBusca([]);
      return;
    }
    const timer = setTimeout(() => {
      buscarEstabelecimentos(searchTerm.trim());
    }, 400);
    return () => clearTimeout(timer);
  }, [searchTerm]);

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
        .eq("ativo", true)
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

  const carregarPendentes = async () => {
    try {
      setLoadingPendentes(true);
      const { data, error } = await supabase.rpc('listar_estabelecimentos_pendentes', {
        p_incluir_normalizados: false,
        p_termo_busca: '',
      });

      if (error) throw error;
      setPendentes((data as EstabelecimentoPendente[]) || []);
    } catch (error) {
      console.error("Erro ao carregar estabelecimentos pendentes:", error);
    } finally {
      setLoadingPendentes(false);
    }
  };

  const buscarEstabelecimentos = async (termo: string) => {
    try {
      const { data, error } = await supabase.rpc('listar_estabelecimentos_pendentes', {
        p_incluir_normalizados: true,
        p_termo_busca: termo,
      });

      if (error) throw error;
      setPendentesBusca((data as EstabelecimentoPendente[]) || []);
    } catch (error) {
      console.error("Erro ao buscar estabelecimentos:", error);
    }
  };

  const handleNormalizarPendente = (item: EstabelecimentoPendente) => {
    setEditingItem(null);
    setFormData({
      nome_original: item.nome_estabelecimento || "",
      nome_normalizado: "",
      cnpj_original: item.cnpj_estabelecimento || "",
      ativo: true,
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.nome_original.trim() && !formData.cnpj_original.trim()) {
      toast({
        title: "Campos obrigatórios",
        description: "Preencha pelo menos o nome original ou o CNPJ.",
        variant: "destructive",
      });
      return;
    }

    if (!formData.nome_normalizado.trim()) {
      toast({
        title: "Campo obrigatório",
        description: "Preencha o nome normalizado.",
        variant: "destructive",
      });
      return;
    }

    try {
      setSubmitting(true);

      const nomeOriginalUpper = formData.nome_original.trim() ? formData.nome_original.trim().toUpperCase() : null;
      const nomeNormalizadoUpper = formData.nome_normalizado.trim().toUpperCase();
      const cnpjLimpo = formData.cnpj_original.trim() ? formData.cnpj_original.trim().replace(/\D/g, '') : null;

      // Validar duplicatas antes de inserir (exceto ao editar)
      if (!editingItem) {
        let query = supabase
          .from("normalizacoes_estabelecimentos")
          .select("id, nome_original, cnpj_original")
          .eq("ativo", true)
          .eq("nome_normalizado", nomeNormalizadoUpper);

        // Priorizar busca por CNPJ se disponível
        if (cnpjLimpo) {
          query = query.eq("cnpj_original", cnpjLimpo);
        } else if (nomeOriginalUpper) {
          query = query.eq("nome_original", nomeOriginalUpper);
        }

        const { data: duplicata } = await query.maybeSingle();

        if (duplicata) {
          toast({
            title: "Normalização já existe",
            description: cnpjLimpo 
              ? `Já existe uma normalização ativa para o CNPJ ${cnpjLimpo} com este nome normalizado.`
              : `Já existe uma normalização ativa para "${nomeOriginalUpper}" com este nome normalizado.`,
            variant: "destructive",
          });
          setSubmitting(false);
          return;
        }
      }

      if (editingItem) {
        // Atualizar
        const { error } = await supabase
          .from("normalizacoes_estabelecimentos")
          .update({
            nome_original: nomeOriginalUpper,
            nome_normalizado: nomeNormalizadoUpper,
            cnpj_original: cnpjLimpo,
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
            cnpj_original: cnpjLimpo,
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
      carregarPendentes();
    } catch (error: any) {
      console.error("Erro ao salvar normalização:", error);
      
      if (error.code === "23505") {
        toast({
          title: "Erro",
          description: "Já existe uma normalização com estes dados.",
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
      cnpj_original: item.cnpj_original || "",
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
      carregarPendentes();
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
      cnpj_original: "",
      ativo: true,
    });
    setEditingItem(null);
  };

  const handleDialogChange = (open: boolean) => {
    setIsDialogOpen(open);
    if (!open) {
      resetForm();
    }
  };

  const analisarImpacto = async () => {
    setAnalisandoImpacto(true);
    try {
      setAnaliseImpacto(null);
      const { data, error } = await supabase.functions.invoke(
        'analisar-impacto-normalizacao'
      );

      if (error) throw error;
      if (data && data.success === false) {
        throw new Error(data.error || 'Falha ao analisar impacto');
      }

      setAnaliseImpacto(data);
      setIsAnaliseDialogOpen(true);
    } catch (error: any) {
      console.error('Erro ao analisar impacto:', error);
      const msg =
        error?.context?.error ||
        error?.message ||
        'Não foi possível analisar o impacto das normalizações.';
      toast({
        title: "Erro",
        description: String(msg),
        variant: "destructive",
      });
    } finally {
      setAnalisandoImpacto(false);
    }
  };

  const aplicarNormalizacaoRetroativa = async () => {
    setProcessandoRetroativa(true);
    setProgressoRetroativa(5);
    setIsAnaliseDialogOpen(false);
    setIsRetroativaDialogOpen(true);

    const POLL_INTERVAL_MS = 2000;
    const MAX_DURATION_MS = 5 * 60 * 1000; // 5 min
    const t0 = Date.now();
    let jobId: string | null = null;
    let timedOut = false;
    let lastJob: any = null;

    try {
      const { data, error } = await supabase.functions.invoke(
        'aplicar-normalizacao-retroativa'
      );
      if (error) throw error;
      jobId = data?.job_id ?? null;
      if (!jobId) throw new Error('Job não foi criado');

      // Polling
      while (Date.now() - t0 < MAX_DURATION_MS) {
        const { data: job, error: jobErr } = await supabase
          .from('normalizacao_retroativa_jobs')
          .select('*')
          .eq('id', jobId)
          .maybeSingle();

        if (jobErr) throw jobErr;
        if (job) {
          lastJob = job;
          const total = Math.max(1, job.total ?? 1);
          const pct = Math.min(99, Math.round(((job.processadas ?? 0) / total) * 100));
          setProgressoRetroativa(Math.max(pct, 5));

          if (job.status === 'completed' || job.status === 'failed') break;
        }
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      }

      if (!lastJob || (lastJob.status !== 'completed' && lastJob.status !== 'failed')) {
        timedOut = true;
        throw new Error('Tempo limite de acompanhamento excedido (5 min). O processamento pode continuar em segundo plano.');
      }

      setProgressoRetroativa(100);

      const estatisticas = {
        total_notas_analisadas: lastJob.total ?? 0,
        notas_atualizadas: lastJob.atualizadas ?? 0,
        normalizacoes_aplicadas: lastJob.normalizacoes_aplicadas ?? [],
        tempo_processamento_segundos: lastJob.finished_at && lastJob.started_at
          ? Math.round((new Date(lastJob.finished_at).getTime() - new Date(lastJob.started_at).getTime()) / 1000)
          : null,
        status: lastJob.status,
        erro: lastJob.erro,
      };
      setRelatorioRetroativa(estatisticas);
      setIsRelatorioDialogOpen(true);

      if (lastJob.status === 'completed') {
        toast({
          title: 'Sucesso!',
          description: `${estatisticas.notas_atualizadas} de ${estatisticas.total_notas_analisadas} notas foram atualizadas.`,
        });
      } else {
        toast({
          title: 'Concluído com falhas',
          description: `${estatisticas.notas_atualizadas} atualizadas antes da falha. ${lastJob.erro ?? ''}`.trim(),
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      console.error('Erro ao aplicar normalizações:', error);
      toast({
        title: timedOut ? 'Tempo excedido' : 'Erro',
        description: error?.message ?? 'Não foi possível aplicar as normalizações retroativas.',
        variant: 'destructive',
      });
    } finally {
      setProcessandoRetroativa(false);
      setProgressoRetroativa(0);
      setIsRetroativaDialogOpen(false);
    }
  };

  const limparDuplicatas = async () => {
    try {
      setLimpandoDuplicatas(true);
      
      const { data, error } = await supabase.functions.invoke(
        'limpar-duplicatas-estabelecimentos'
      );

      if (error) throw error;

      toast({
        title: data.duplicatasRemovidas > 0 ? "Sucesso!" : "Tudo limpo!",
        description: data.message,
      });

      if (data.duplicatasRemovidas > 0) {
        carregarNormalizacoes();
      }

    } catch (error) {
      console.error('Erro ao limpar duplicatas:', error);
      toast({
        title: "Erro",
        description: "Não foi possível limpar as duplicatas.",
        variant: "destructive",
      });
    } finally {
      setLimpandoDuplicatas(false);
    }
  };

  const normalizacoesFiltradas = normalizacoes.filter((norm) => {
    const termoNorm = normalizarParaBusca(searchTerm);
    const cnpjSearch = searchTerm.replace(/\D/g, '');
    return (
      normalizarParaBusca(norm.nome_original).includes(termoNorm) ||
      normalizarParaBusca(norm.nome_normalizado).includes(termoNorm) ||
      (norm.cnpj_original && norm.cnpj_original.includes(cnpjSearch))
    );
  });

  const formatCnpj = (cnpj: string) => {
    return cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  };

  const copiarCnpj = async (cnpj: string) => {
    const formatado = formatCnpj(cnpj);
    try {
      await navigator.clipboard.writeText(formatado);
      toast({
        title: "CNPJ copiado!",
        description: `${formatado} copiado para a área de transferência.`,
      });
    } catch (err) {
      toast({
        title: "Erro ao copiar",
        description: "Não foi possível copiar o CNPJ.",
        variant: "destructive",
      });
    }
  };

  // Determinar quais estabelecimentos mostrar na busca (excluir os que já têm regra nas normalizacoesFiltradas)
  const estabelecimentosBuscaExibir = searchTerm.trim()
    ? pendentesBusca
    : [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <PageHeader title="Normalizações de Estabelecimentos" />

      <div className="container mx-auto p-4 max-w-4xl space-y-6">
        {/* Header */}
        <div className="flex justify-end">
          <div className="flex flex-wrap gap-2 justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={limparDuplicatas}
              disabled={limpandoDuplicatas}
              className="gap-2"
            >
              {limpandoDuplicatas ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
              <span className="hidden sm:inline">Limpar Duplicatas</span>
              <span className="sm:hidden">Limpar</span>
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              onClick={analisarImpacto}
              disabled={analisandoImpacto}
              className="gap-2"
            >
              <History className={`w-4 h-4 ${analisandoImpacto ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">
                {analisandoImpacto ? 'Analisando...' : 'Aplicar a Notas Antigas'}
              </span>
              <span className="sm:hidden">
                {analisandoImpacto ? 'Analisando' : 'Aplicar'}
              </span>
            </Button>

            <Dialog open={isDialogOpen} onOpenChange={handleDialogChange}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2">
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Nova Normalização</span>
                <span className="sm:hidden">Novo</span>
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
                  <Label htmlFor="nome_original">Nome Original</Label>
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
                  <Label htmlFor="cnpj_original">CNPJ Original</Label>
                  <Input
                    id="cnpj_original"
                    placeholder="Ex: 12.345.678/0001-90 ou 12345678000190"
                    value={formData.cnpj_original}
                    onChange={(e) =>
                      setFormData({ ...formData, cnpj_original: e.target.value })
                    }
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    CNPJ do estabelecimento (prioridade na normalização)
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
                <Button variant="outline" onClick={() => handleDialogChange(false)}>
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
            placeholder="Buscar por nome, supermercado ou CNPJ..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          <Card>
            <CardHeader className="pb-3 px-4 sm:px-6">
              <CardDescription className="text-xs sm:text-sm leading-tight">Normalizações Ativas</CardDescription>
              <CardTitle className="text-2xl sm:text-3xl">{normalizacoes.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-3 px-4 sm:px-6">
              <CardDescription className="text-xs sm:text-sm leading-tight">Pendentes de Normalização</CardDescription>
              <CardTitle className="text-2xl sm:text-3xl text-orange-500">
                {loadingPendentes ? "..." : pendentes.length}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-3 px-4 sm:px-6">
              <CardDescription className="text-xs sm:text-sm leading-tight">Total Geral</CardDescription>
              <CardTitle className="text-2xl sm:text-3xl">
                {loadingPendentes ? "..." : normalizacoes.length + pendentes.length}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Resultados de busca global */}
        {searchTerm.trim() && estabelecimentosBuscaExibir.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Search className="w-5 h-5" />
              Resultados da busca em notas fiscais
            </h3>
            {estabelecimentosBuscaExibir.map((item, idx) => (
              <Card key={`busca-${idx}`} className="border-dashed">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Building2 className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                        <CardTitle className="text-lg truncate">
                          {item.nome_estabelecimento}
                        </CardTitle>
                      </div>
                      {item.cnpj_estabelecimento && (
                        <button
                          type="button"
                          onClick={() => copiarCnpj(item.cnpj_estabelecimento!)}
                          className="text-xs font-mono text-muted-foreground hover:text-primary mb-1 inline-flex items-center gap-1 cursor-pointer transition-colors"
                          title="Clique para copiar o CNPJ"
                        >
                          CNPJ: {formatCnpj(item.cnpj_estabelecimento)}
                          <Copy className="w-3 h-3" />
                        </button>
                      )}
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="gap-1">
                          <FileText className="w-3 h-3" />
                          {item.total_notas} {item.total_notas === 1 ? 'nota' : 'notas'}
                        </Badge>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleNormalizarPendente(item)}
                      className="gap-1"
                    >
                      <Plus className="w-4 h-4" />
                      Normalizar
                    </Button>
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        )}

        {/* Estabelecimentos Pendentes de Normalização */}
        {!searchTerm.trim() && (
          <>
            {loadingPendentes ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : pendentes.length > 0 ? (
              <div className="space-y-3">
                <h3 className="text-lg font-semibold flex items-center gap-2 text-orange-600">
                  <Building2 className="w-5 h-5" />
                  Estabelecimentos Pendentes de Normalização ({pendentes.length})
                </h3>
                {pendentes.map((item, idx) => (
                  <Card key={`pendente-${idx}`} className="border-l-4 border-l-orange-400 transition-shadow hover:shadow-md">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Building2 className="w-5 h-5 text-orange-500 flex-shrink-0" />
                            <CardTitle className="text-lg truncate">
                              {item.nome_estabelecimento}
                            </CardTitle>
                          </div>
                          {item.cnpj_estabelecimento && (
                            <button
                              type="button"
                              onClick={() => copiarCnpj(item.cnpj_estabelecimento!)}
                              className="text-xs font-mono text-muted-foreground hover:text-primary mb-1 inline-flex items-center gap-1 cursor-pointer transition-colors"
                              title="Clique para copiar o CNPJ"
                            >
                              CNPJ: {formatCnpj(item.cnpj_estabelecimento)}
                              <Copy className="w-3 h-3" />
                            </button>
                          )}
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="gap-1">
                              <FileText className="w-3 h-3" />
                              {item.total_notas} {item.total_notas === 1 ? 'nota' : 'notas'}
                            </Badge>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => handleNormalizarPendente(item)}
                          className="gap-1"
                        >
                          <Plus className="w-4 h-4" />
                          Normalizar
                        </Button>
                      </div>
                    </CardHeader>
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="py-8 text-center">
                  <CheckCircle className="w-10 h-10 mx-auto mb-3 text-green-500" />
                  <p className="text-muted-foreground">
                    Todos os estabelecimentos já foram normalizados!
                  </p>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* Separator */}
        {!searchTerm.trim() && normalizacoes.length > 0 && (
          <Separator />
        )}

        {/* Lista de Normalizações Existentes */}
        <div className="space-y-3">
          {normalizacoes.length > 0 && (
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              Normalizações Ativas ({normalizacoesFiltradas.length})
            </h3>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : normalizacoesFiltradas.length === 0 ? (
            !searchTerm && normalizacoes.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Building2 className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">
                    Nenhuma normalização cadastrada ainda.
                  </p>
                </CardContent>
              </Card>
            ) : searchTerm ? (
              <Card>
                <CardContent className="py-6 text-center">
                  <p className="text-muted-foreground text-sm">
                    Nenhuma normalização ativa encontrada com esses termos.
                  </p>
                </CardContent>
              </Card>
            ) : null
          ) : (
            normalizacoesFiltradas.map((norm) => (
              <Card key={norm.id} className="transition-shadow hover:shadow-md">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <Building2 className="w-5 h-5 text-primary flex-shrink-0" />
                        <CardTitle className="text-lg truncate">
                          {norm.nome_original || "Sem nome"}
                        </CardTitle>
                        <Badge variant={norm.ativo ? "default" : "secondary"}>
                          {norm.ativo ? "Ativo" : "Inativo"}
                        </Badge>
                      </div>
                      {norm.cnpj_original && (
                        <div className="text-xs font-mono text-muted-foreground mb-1">
                          CNPJ: {formatCnpj(norm.cnpj_original)}
                        </div>
                      )}
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
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default NormalizacoesEstabelecimentos;
