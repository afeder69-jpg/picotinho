import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Package, 
  Users, 
  TrendingUp,
  Shield,
  Sparkles,
  AlertCircle,
  Edit3
} from "lucide-react";

export default function NormalizacaoGlobal() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [isMaster, setIsMaster] = useState(false);
  const [stats, setStats] = useState({
    totalProdutosMaster: 0,
    pendentesRevisao: 0,
    autoAprovados: 0,
    totalUsuarios: 0
  });
  const [candidatos, setCandidatos] = useState<any[]>([]);
  const [produtosMaster, setProdutosMaster] = useState<any[]>([]);
  const [processando, setProcessando] = useState(false);
  
  // Estados para modais
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [candidatoAtual, setCandidatoAtual] = useState<any>(null);
  
  // Estados para formulário de edição
  const [editForm, setEditForm] = useState({
    nome_padrao: '',
    categoria: '',
    nome_base: '',
    marca: '',
    tipo_embalagem: '',
    qtd_valor: '',
    qtd_unidade: '',
    granel: false,
    sku_global: ''
  });
  
  // Estado para observações de rejeição
  const [observacoesRejeicao, setObservacoesRejeicao] = useState('');

  useEffect(() => {
    verificarAcessoMaster();
  }, []);

  async function verificarAcessoMaster() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        toast({
          title: "Acesso negado",
          description: "Você precisa estar autenticado",
          variant: "destructive"
        });
        navigate('/');
        return;
      }

      // Verificar se é master
      const { data: roles, error: roleError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'master')
        .maybeSingle();

      if (!roles || roleError) {
        console.error('Erro ao verificar role:', roleError);
        toast({
          title: "Acesso restrito",
          description: "Apenas usuários master podem acessar esta área",
          variant: "destructive"
        });
        navigate('/');
        return;
      }

      setIsMaster(true);
      await carregarDados();
    } catch (error: any) {
      console.error('Erro ao verificar acesso:', error);
      navigate('/');
    } finally {
      setLoading(false);
    }
  }

  async function carregarDados() {
    try {
      // Estatísticas
      const [
        { count: totalMaster },
        { count: pendentes },
        { count: autoAprovados },
        { data: usuarios }
      ] = await Promise.all([
        supabase.from('produtos_master_global').select('*', { count: 'exact', head: true }),
        supabase.from('produtos_candidatos_normalizacao').select('*', { count: 'exact', head: true }).eq('status', 'pendente'),
        supabase.from('produtos_candidatos_normalizacao').select('*', { count: 'exact', head: true }).eq('status', 'auto_aprovado'),
        supabase.from('profiles').select('id')
      ]);

      setStats({
        totalProdutosMaster: totalMaster || 0,
        pendentesRevisao: pendentes || 0,
        autoAprovados: autoAprovados || 0,
        totalUsuarios: usuarios?.length || 0
      });

      // Candidatos pendentes
      const { data: candidatosPendentes } = await supabase
        .from('produtos_candidatos_normalizacao')
        .select('*')
        .eq('status', 'pendente')
        .order('confianca_ia', { ascending: false })
        .limit(20);

      setCandidatos(candidatosPendentes || []);

      // Produtos master recentes
      const { data: masterRecentes } = await supabase
        .from('produtos_master_global')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

      setProdutosMaster(masterRecentes || []);

    } catch (error: any) {
      console.error('Erro ao carregar dados:', error);
      toast({
        title: "Erro",
        description: "Erro ao carregar dados",
        variant: "destructive"
      });
    }
  }

  async function processarNormalizacao() {
    setProcessando(true);
    try {
      toast({
        title: "Processamento iniciado",
        description: "A normalização está sendo processada em background...",
      });

      const { data, error } = await supabase.functions.invoke('processar-normalizacao-global');

      if (error) throw error;

      toast({
        title: "Processamento concluído",
        description: `${data.processados} produtos processados. ${data.auto_aprovados} auto-aprovados, ${data.para_revisao} aguardando revisão.`,
      });

      await carregarDados();

    } catch (error: any) {
      console.error('Erro ao processar:', error);
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setProcessando(false);
    }
  }

  function abrirModalEdicao(candidato: any) {
    setCandidatoAtual(candidato);
    setEditForm({
      nome_padrao: candidato.nome_padrao_sugerido || '',
      categoria: candidato.categoria_sugerida || '',
      nome_base: candidato.nome_base_sugerido || '',
      marca: candidato.marca_sugerida || '',
      tipo_embalagem: candidato.tipo_embalagem_sugerido || '',
      qtd_valor: candidato.qtd_valor_sugerido?.toString() || '',
      qtd_unidade: candidato.qtd_unidade_sugerido || '',
      granel: candidato.granel_sugerido || false,
      sku_global: candidato.sugestao_sku_global || ''
    });
    setEditModalOpen(true);
  }

  function abrirModalRejeicao(candidato: any) {
    setCandidatoAtual(candidato);
    setObservacoesRejeicao('');
    setRejectModalOpen(true);
  }

  async function aprovarComModificacoes() {
    if (!candidatoAtual) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      // Criar produto master com dados editados
      const { data: produtoMaster, error: errorMaster } = await supabase
        .from('produtos_master_global')
        .insert({
          sku_global: editForm.sku_global,
          nome_padrao: editForm.nome_padrao,
          categoria: editForm.categoria,
          nome_base: editForm.nome_base,
          marca: editForm.marca || null,
          tipo_embalagem: editForm.tipo_embalagem || null,
          qtd_valor: editForm.qtd_valor ? parseFloat(editForm.qtd_valor) : null,
          qtd_unidade: editForm.qtd_unidade || null,
          granel: editForm.granel,
          confianca_normalizacao: candidatoAtual.confianca_ia,
          aprovado_por: user.id,
          aprovado_em: new Date().toISOString(),
          status: 'ativo'
        })
        .select()
        .single();

      if (errorMaster) throw errorMaster;

      // Atualizar candidato
      const { error: errorCandidato } = await supabase
        .from('produtos_candidatos_normalizacao')
        .update({ 
          status: 'aprovado',
          revisado_por: user.id,
          revisado_em: new Date().toISOString(),
          sugestao_produto_master: produtoMaster.id
        })
        .eq('id', candidatoAtual.id);

      if (errorCandidato) throw errorCandidato;

      // Salvar no log de decisões para aprendizado da IA
      const { error: errorLog } = await supabase
        .from('normalizacao_decisoes_log')
        .insert({
          texto_original: candidatoAtual.texto_original,
          candidato_id: candidatoAtual.id,
          decisao: 'aprovado_com_modificacoes',
          sugestao_ia: {
            nome_padrao: candidatoAtual.nome_padrao_sugerido,
            categoria: candidatoAtual.categoria_sugerida,
            nome_base: candidatoAtual.nome_base_sugerido,
            marca: candidatoAtual.marca_sugerida,
            tipo_embalagem: candidatoAtual.tipo_embalagem_sugerido,
            qtd_valor: candidatoAtual.qtd_valor_sugerido,
            qtd_unidade: candidatoAtual.qtd_unidade_sugerido,
            granel: candidatoAtual.granel_sugerido,
            confianca: candidatoAtual.confianca_ia
          },
          decisao_master: editForm,
          decidido_por: user.id,
          produto_master_final: produtoMaster.id,
          usado_para_treino: false
        });

      if (errorLog) console.error('Erro ao salvar log:', errorLog);

      toast({
        title: "Aprovado com modificações",
        description: "Produto adicionado ao catálogo master com suas edições",
      });

      setEditModalOpen(false);
      await carregarDados();

    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive"
      });
    }
  }

  async function aprovarSemModificacoes(candidatoId: string) {
    try {
      const candidato = candidatos.find(c => c.id === candidatoId);
      if (!candidato) return;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      // Criar produto master
      const { data: produtoMaster, error: errorMaster } = await supabase
        .from('produtos_master_global')
        .insert({
          sku_global: candidato.sugestao_sku_global,
          nome_padrao: candidato.nome_padrao_sugerido,
          categoria: candidato.categoria_sugerida,
          nome_base: candidato.nome_base_sugerido,
          marca: candidato.marca_sugerida,
          tipo_embalagem: candidato.tipo_embalagem_sugerido,
          qtd_valor: candidato.qtd_valor_sugerido,
          qtd_unidade: candidato.qtd_unidade_sugerido,
          granel: candidato.granel_sugerido,
          confianca_normalizacao: candidato.confianca_ia,
          aprovado_por: user.id,
          aprovado_em: new Date().toISOString(),
          status: 'ativo'
        })
        .select()
        .single();

      if (errorMaster) throw errorMaster;

      // Atualizar candidato
      const { error: errorCandidato } = await supabase
        .from('produtos_candidatos_normalizacao')
        .update({ 
          status: 'aprovado',
          revisado_por: user.id,
          revisado_em: new Date().toISOString(),
          sugestao_produto_master: produtoMaster.id
        })
        .eq('id', candidatoId);

      if (errorCandidato) throw errorCandidato;

      // Salvar no log - aprovação sem modificações
      const { error: errorLog } = await supabase
        .from('normalizacao_decisoes_log')
        .insert({
          texto_original: candidato.texto_original,
          candidato_id: candidato.id,
          decisao: 'aprovado_sem_modificacoes',
          sugestao_ia: {
            nome_padrao: candidato.nome_padrao_sugerido,
            categoria: candidato.categoria_sugerida,
            confianca: candidato.confianca_ia
          },
          decidido_por: user.id,
          produto_master_final: produtoMaster.id,
          usado_para_treino: false
        });

      if (errorLog) console.error('Erro ao salvar log:', errorLog);

      toast({
        title: "Aprovado",
        description: "Produto adicionado ao catálogo master",
      });

      await carregarDados();

    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive"
      });
    }
  }

  async function rejeitarComObservacoes() {
    if (!candidatoAtual) return;
    
    if (!observacoesRejeicao.trim()) {
      toast({
        title: "Observações obrigatórias",
        description: "Por favor, explique o motivo da rejeição para ajudar a IA a aprender",
        variant: "destructive"
      });
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      // Atualizar candidato com observações
      const { error: errorCandidato } = await supabase
        .from('produtos_candidatos_normalizacao')
        .update({ 
          status: 'rejeitado',
          revisado_por: user.id,
          revisado_em: new Date().toISOString(),
          observacoes_revisor: observacoesRejeicao
        })
        .eq('id', candidatoAtual.id);

      if (errorCandidato) throw errorCandidato;

      // Salvar no log para aprendizado
      const { error: errorLog } = await supabase
        .from('normalizacao_decisoes_log')
        .insert({
          texto_original: candidatoAtual.texto_original,
          candidato_id: candidatoAtual.id,
          decisao: 'rejeitado',
          sugestao_ia: {
            nome_padrao: candidatoAtual.nome_padrao_sugerido,
            categoria: candidatoAtual.categoria_sugerida,
            confianca: candidatoAtual.confianca_ia,
            razao_ia: candidatoAtual.razao_ia
          },
          feedback_texto: observacoesRejeicao,
          decidido_por: user.id,
          usado_para_treino: false
        });

      if (errorLog) console.error('Erro ao salvar log:', errorLog);

      toast({
        title: "Rejeitado",
        description: "Feedback registrado para melhorar a IA",
      });

      setRejectModalOpen(false);
      await carregarDados();

    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive"
      });
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <Shield className="w-12 h-12 mx-auto animate-pulse text-primary" />
          <p className="text-muted-foreground">Verificando acesso master...</p>
        </div>
      </div>
    );
  }

  if (!isMaster) {
    return null;
  }

  return (
    <div className="container mx-auto p-6 space-y-6 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Shield className="w-8 h-8 text-primary" />
            Normalização Global Master
          </h1>
          <p className="text-muted-foreground mt-1">
            Sistema de normalização universal de produtos Picotinho
          </p>
        </div>
        <Button 
          onClick={processarNormalizacao}
          disabled={processando}
          className="gap-2"
        >
          <Sparkles className="w-4 h-4" />
          {processando ? 'Processando...' : 'Processar Novas Normalizações'}
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Produtos Master</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalProdutosMaster}</div>
            <p className="text-xs text-muted-foreground">no catálogo universal</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Pendentes Revisão</CardTitle>
            <Clock className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{stats.pendentesRevisao}</div>
            <p className="text-xs text-muted-foreground">aguardando sua aprovação</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Auto-Aprovados</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.autoAprovados}</div>
            <p className="text-xs text-muted-foreground">confiança ≥ 90%</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Usuários</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalUsuarios}</div>
            <p className="text-xs text-muted-foreground">usando o sistema</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="pendentes" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pendentes" className="gap-2">
            <Clock className="w-4 h-4" />
            Pendentes ({stats.pendentesRevisao})
          </TabsTrigger>
          <TabsTrigger value="catalogo" className="gap-2">
            <Package className="w-4 h-4" />
            Catálogo Master
          </TabsTrigger>
        </TabsList>

        {/* Candidatos Pendentes */}
        <TabsContent value="pendentes" className="space-y-4">
          {candidatos.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <CheckCircle2 className="w-16 h-16 text-green-500 mb-4" />
                <h3 className="text-lg font-semibold mb-2">Tudo aprovado!</h3>
                <p className="text-muted-foreground text-center">
                  Não há candidatos pendentes de revisão no momento.
                </p>
              </CardContent>
            </Card>
          ) : (
            candidatos.map((candidato) => (
              <Card key={candidato.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="space-y-2 flex-1">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-lg">{candidato.nome_padrao_sugerido}</CardTitle>
                        <Badge variant={candidato.confianca_ia >= 80 ? "default" : "secondary"}>
                          {candidato.confianca_ia}% confiança
                        </Badge>
                        <Badge variant="outline">{candidato.categoria_sugerida}</Badge>
                      </div>
                      <CardDescription>
                        Texto original: "{candidato.texto_original}"
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => abrirModalEdicao(candidato)}
                        className="gap-1"
                      >
                        <Edit3 className="w-4 h-4" />
                        Editar e Aprovar
                      </Button>
                      <Button 
                        size="sm" 
                        variant="default"
                        onClick={() => aprovarSemModificacoes(candidato.id)}
                        className="gap-1"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        Aprovar
                      </Button>
                      <Button 
                        size="sm" 
                        variant="destructive"
                        onClick={() => abrirModalRejeicao(candidato)}
                        className="gap-1"
                      >
                        <XCircle className="w-4 h-4" />
                        Rejeitar
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">SKU:</span>
                      <p className="font-mono">{candidato.sugestao_sku_global}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Nome Base:</span>
                      <p className="font-medium">{candidato.nome_base_sugerido}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Marca:</span>
                      <p>{candidato.marca_sugerida || '-'}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Quantidade:</span>
                      <p>
                        {candidato.qtd_valor_sugerido} {candidato.qtd_unidade_sugerido}
                        {candidato.granel_sugerido && ' (granel)'}
                      </p>
                    </div>
                  </div>
                  {candidato.razao_ia && (
                    <div className="mt-4 p-3 bg-muted rounded-lg">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-muted-foreground mt-0.5" />
                        <div>
                          <p className="text-sm font-medium">Análise da IA:</p>
                          <p className="text-sm text-muted-foreground">{candidato.razao_ia}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* Catálogo Master */}
        <TabsContent value="catalogo" className="space-y-4">
          {produtosMaster.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Package className="w-16 h-16 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">Catálogo vazio</h3>
                <p className="text-muted-foreground text-center">
                  Nenhum produto normalizado ainda. Execute o processamento para começar.
                </p>
              </CardContent>
            </Card>
          ) : (
            produtosMaster.map((produto) => (
              <Card key={produto.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-lg">{produto.nome_padrao}</CardTitle>
                        <Badge variant="outline">{produto.categoria}</Badge>
                        {produto.status === 'ativo' && (
                          <Badge variant="default">Ativo</Badge>
                        )}
                      </div>
                      <CardDescription>SKU: {produto.sku_global}</CardDescription>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <div className="text-center">
                        <Users className="w-4 h-4 mx-auto mb-1" />
                        <span>{produto.total_usuarios} usuários</span>
                      </div>
                      <div className="text-center">
                        <TrendingUp className="w-4 h-4 mx-auto mb-1" />
                        <span>{produto.total_notas} notas</span>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Nome Base:</span>
                      <p className="font-medium">{produto.nome_base}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Marca:</span>
                      <p>{produto.marca || '-'}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Embalagem:</span>
                      <p>{produto.tipo_embalagem || '-'}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Quantidade:</span>
                      <p>
                        {produto.qtd_valor} {produto.qtd_unidade}
                        {produto.granel && ' (granel)'}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>

      {/* Modal de Edição */}
      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Normalização</DialogTitle>
            <DialogDescription>
              Modifique os campos conforme necessário. Suas correções ajudarão a IA a aprender.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="nome_padrao">Nome Padrão *</Label>
              <Input
                id="nome_padrao"
                value={editForm.nome_padrao}
                onChange={(e) => setEditForm({...editForm, nome_padrao: e.target.value})}
                placeholder="Ex: Arroz Branco Tipo 1"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="categoria">Categoria *</Label>
                <Input
                  id="categoria"
                  value={editForm.categoria}
                  onChange={(e) => setEditForm({...editForm, categoria: e.target.value})}
                  placeholder="Ex: Alimentos"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="nome_base">Nome Base *</Label>
                <Input
                  id="nome_base"
                  value={editForm.nome_base}
                  onChange={(e) => setEditForm({...editForm, nome_base: e.target.value})}
                  placeholder="Ex: Arroz"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="marca">Marca</Label>
                <Input
                  id="marca"
                  value={editForm.marca}
                  onChange={(e) => setEditForm({...editForm, marca: e.target.value})}
                  placeholder="Ex: Tio João"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="tipo_embalagem">Tipo Embalagem</Label>
                <Input
                  id="tipo_embalagem"
                  value={editForm.tipo_embalagem}
                  onChange={(e) => setEditForm({...editForm, tipo_embalagem: e.target.value})}
                  placeholder="Ex: Pacote, Caixa"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="qtd_valor">Quantidade (Valor)</Label>
                <Input
                  id="qtd_valor"
                  type="number"
                  step="0.01"
                  value={editForm.qtd_valor}
                  onChange={(e) => setEditForm({...editForm, qtd_valor: e.target.value})}
                  placeholder="Ex: 1"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="qtd_unidade">Quantidade (Unidade)</Label>
                <Input
                  id="qtd_unidade"
                  value={editForm.qtd_unidade}
                  onChange={(e) => setEditForm({...editForm, qtd_unidade: e.target.value})}
                  placeholder="Ex: kg, g, L"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sku_global">SKU Global</Label>
              <Input
                id="sku_global"
                value={editForm.sku_global}
                onChange={(e) => setEditForm({...editForm, sku_global: e.target.value})}
                placeholder="Gerado automaticamente"
                className="font-mono"
              />
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="granel"
                checked={editForm.granel}
                onCheckedChange={(checked) => setEditForm({...editForm, granel: checked})}
              />
              <Label htmlFor="granel">Produto vendido a granel</Label>
            </div>

            {candidatoAtual && (
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">
                  <strong>Texto original:</strong> {candidatoAtual.texto_original}
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={aprovarComModificacoes} disabled={!editForm.nome_padrao || !editForm.categoria || !editForm.nome_base}>
              <CheckCircle2 className="w-4 h-4 mr-2" />
              Aprovar com Modificações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Rejeição */}
      <Dialog open={rejectModalOpen} onOpenChange={setRejectModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Rejeitar Normalização</DialogTitle>
            <DialogDescription>
              Por favor, explique o motivo da rejeição. Isso ajudará a IA a melhorar suas sugestões.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {candidatoAtual && (
              <div className="space-y-2">
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-sm">
                    <strong>Texto original:</strong> {candidatoAtual.texto_original}
                  </p>
                  <p className="text-sm mt-2">
                    <strong>Sugestão da IA:</strong> {candidatoAtual.nome_padrao_sugerido}
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="observacoes">Motivo da rejeição *</Label>
              <Textarea
                id="observacoes"
                value={observacoesRejeicao}
                onChange={(e) => setObservacoesRejeicao(e.target.value)}
                placeholder="Ex: Nome muito genérico, falta informação da marca, categoria incorreta..."
                rows={4}
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground">
                Suas observações serão usadas para treinar a IA e melhorar futuras normalizações.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectModalOpen(false)}>
              Cancelar
            </Button>
            <Button 
              variant="destructive" 
              onClick={rejeitarComObservacoes}
              disabled={!observacoesRejeicao.trim()}
            >
              <XCircle className="w-4 h-4 mr-2" />
              Rejeitar com Feedback
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
