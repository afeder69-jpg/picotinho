import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Package, 
  Users, 
  TrendingUp,
  Shield,
  Sparkles,
  AlertCircle
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
      const { data: roles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'master')
        .single();

      if (!roles) {
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

  async function aprovarCandidato(candidatoId: string) {
    try {
      const candidato = candidatos.find(c => c.id === candidatoId);
      if (!candidato) return;

      // Criar produto master
      const { error: errorMaster } = await supabase
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
          status: 'ativo'
        });

      if (errorMaster) throw errorMaster;

      // Atualizar candidato
      const { error: errorCandidato } = await supabase
        .from('produtos_candidatos_normalizacao')
        .update({ 
          status: 'aprovado',
          revisado_em: new Date().toISOString()
        })
        .eq('id', candidatoId);

      if (errorCandidato) throw errorCandidato;

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

  async function rejeitarCandidato(candidatoId: string) {
    try {
      const { error } = await supabase
        .from('produtos_candidatos_normalizacao')
        .update({ 
          status: 'rejeitado',
          revisado_em: new Date().toISOString()
        })
        .eq('id', candidatoId);

      if (error) throw error;

      toast({
        title: "Rejeitado",
        description: "Candidato marcado como rejeitado",
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
                        variant="default"
                        onClick={() => aprovarCandidato(candidato.id)}
                        className="gap-1"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        Aprovar
                      </Button>
                      <Button 
                        size="sm" 
                        variant="destructive"
                        onClick={() => rejeitarCandidato(candidato.id)}
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
    </div>
  );
}
