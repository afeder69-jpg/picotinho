import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/components/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Combobox } from "@/components/ui/combobox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Shield, Trash2, UserPlus, Search, RotateCcw, TrendingUp } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Master {
  id: string;
  user_id: string;
  role: string;
  created_at: string;
  revogado_em: string | null;
  revogado_por: string | null;
  motivo_revogacao: string | null;
  profiles: {
    nome: string;
    email: string;
    avatar_url: string;
  };
  total_normalizacoes: number;
}

interface UsuarioBusca {
  id: string;
  user_id: string;
  nome: string;
  email: string;
  avatar_url: string;
  is_master: boolean;
}

export default function GerenciarMasters() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [showRevogarDialog, setShowRevogarDialog] = useState(false);
  const [showReativarDialog, setShowReativarDialog] = useState(false);
  const [masterSelecionado, setMasterSelecionado] = useState<Master | null>(null);
  const [motivoRevogacao, setMotivoRevogacao] = useState("");

  // Verificar se usuário é admin
  useEffect(() => {
    const verificarAdmin = async () => {
      if (!user?.id) {
        toast.error("Você precisa estar autenticado");
        navigate("/");
        return;
      }

      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .is("revogado_em", null)
        .maybeSingle();

      if (error || !data) {
        toast.error("Acesso negado: apenas admins podem gerenciar Masters");
        navigate("/");
      }
    };

    verificarAdmin();
  }, [user, navigate]);

  // Buscar Masters ativos
  const { data: mastersAtivos = [], isLoading: loadingAtivos } = useQuery({
    queryKey: ["masters-ativos"],
    queryFn: async () => {
      const { data: rolesData, error: rolesError } = await supabase
        .from("user_roles")
        .select("id, user_id, role, created_at, revogado_em, revogado_por, motivo_revogacao")
        .eq("role", "master")
        .is("revogado_em", null)
        .order("created_at", { ascending: false });

      if (rolesError) throw rolesError;

      // Buscar perfis e contagem de normalizações em paralelo
      const mastersComDados = await Promise.all(
        (rolesData || []).map(async (role) => {
          const [profileResult, normCount] = await Promise.all([
            supabase
              .from("profiles")
              .select("nome, email, avatar_url")
              .eq("user_id", role.user_id)
              .single(),
            supabase
              .from("normalizacao_decisoes_log")
              .select("id", { count: "exact", head: true })
              .eq("decidido_por", role.user_id),
          ]);

          return {
            ...role,
            profiles: profileResult.data || { nome: "N/A", email: "N/A", avatar_url: "" },
            total_normalizacoes: normCount.count || 0,
          };
        })
      );

      return mastersComDados;
    },
    enabled: !!user?.id,
  });

  // Buscar Masters revogados
  const { data: mastersRevogados = [], isLoading: loadingRevogados } = useQuery({
    queryKey: ["masters-revogados"],
    queryFn: async () => {
      const { data: rolesData, error: rolesError } = await supabase
        .from("user_roles")
        .select("id, user_id, role, created_at, revogado_em, revogado_por, motivo_revogacao")
        .eq("role", "master")
        .not("revogado_em", "is", null)
        .order("revogado_em", { ascending: false });

      if (rolesError) throw rolesError;

      const mastersComDados = await Promise.all(
        (rolesData || []).map(async (role) => {
          const [profileResult, normCount] = await Promise.all([
            supabase
              .from("profiles")
              .select("nome, email, avatar_url")
              .eq("user_id", role.user_id)
              .single(),
            supabase
              .from("normalizacao_decisoes_log")
              .select("id", { count: "exact", head: true })
              .eq("decidido_por", role.user_id),
          ]);

          return {
            ...role,
            profiles: profileResult.data || { nome: "N/A", email: "N/A", avatar_url: "" },
            total_normalizacoes: normCount.count || 0,
          };
        })
      );

      return mastersComDados;
    },
    enabled: !!user?.id,
  });

  // Buscar usuários disponíveis com debounce
  const { data: usuariosDisponiveis = [], isLoading: loadingUsuarios } = useQuery({
    queryKey: ["usuarios-disponiveis", searchQuery],
    queryFn: async () => {
      if (searchQuery.length < 2) return [];
      
      const { data, error } = await supabase
        .from("profiles")
        .select("id, user_id, nome, email, avatar_url")
        .or(`nome.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%`)
        .limit(10);
      
      if (error) throw error;
      
      // Filtrar usuários que já são Masters
      const userIds = data.map(u => u.user_id);
      const { data: masters } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "master")
        .is("revogado_em", null)
        .in("user_id", userIds);
      
      const masterIds = new Set(masters?.map(m => m.user_id) || []);
      return data.filter(u => !masterIds.has(u.user_id));
    },
    enabled: searchQuery.length >= 2,
    staleTime: 30000, // 30s cache
  });

  // Buscar usuário selecionado
  const { data: usuarioSelecionado } = useQuery({
    queryKey: ["usuario-selecionado", selectedUserId],
    queryFn: async () => {
      if (!selectedUserId) return null;
      
      const { data, error } = await supabase
        .from("profiles")
        .select("id, user_id, nome, email, avatar_url")
        .eq("user_id", selectedUserId)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!selectedUserId,
  });

  // Buscar estatísticas
  const { data: stats } = useQuery({
    queryKey: ["masters-stats"],
    queryFn: async () => {
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);

      const primeiroDiaMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);

      const [normHoje, normMes] = await Promise.all([
        supabase
          .from("normalizacao_decisoes_log")
          .select("id", { count: "exact", head: true })
          .gte("created_at", hoje.toISOString()),
        supabase
          .from("normalizacao_decisoes_log")
          .select("id", { count: "exact", head: true })
          .gte("created_at", primeiroDiaMes.toISOString()),
      ]);

      return {
        totalMasters: mastersAtivos.length,
        normHoje: normHoje.count || 0,
        normMes: normMes.count || 0,
      };
    },
    enabled: !!mastersAtivos.length,
  });

  // Revogar Master
  const revogarMutation = useMutation({
    mutationFn: async ({ masterId, motivo }: { masterId: string; motivo: string }) => {
      const { error } = await supabase
        .from("user_roles")
        .update({
          revogado_em: new Date().toISOString(),
          revogado_por: user?.id,
          motivo_revogacao: motivo || null,
        })
        .eq("user_id", masterId)
        .eq("role", "master");

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Role Master revogada com sucesso");
      queryClient.invalidateQueries({ queryKey: ["masters-ativos"] });
      queryClient.invalidateQueries({ queryKey: ["masters-revogados"] });
      setShowRevogarDialog(false);
      setMotivoRevogacao("");
    },
    onError: (error: any) => {
      toast.error("Erro ao revogar Master: " + error.message);
    },
  });

  // Reativar Master
  const reativarMutation = useMutation({
    mutationFn: async (masterId: string) => {
      const { error } = await supabase
        .from("user_roles")
        .update({
          revogado_em: null,
          revogado_por: null,
          motivo_revogacao: null,
          reativado_em: new Date().toISOString(),
          reativado_por: user?.id,
        })
        .eq("user_id", masterId)
        .eq("role", "master");

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Master reativado com sucesso");
      queryClient.invalidateQueries({ queryKey: ["masters-ativos"] });
      queryClient.invalidateQueries({ queryKey: ["masters-revogados"] });
      setShowReativarDialog(false);
    },
    onError: (error: any) => {
      toast.error("Erro ao reativar Master: " + error.message);
    },
  });

  // Promover a Master
  const promoverMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from("user_roles")
        .insert({
          user_id: userId,
          role: "master",
        });

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Usuário promovido a Master com sucesso");
      queryClient.invalidateQueries({ queryKey: ["masters-ativos"] });
      setSelectedUserId("");
      setSearchQuery("");
    },
    onError: (error: any) => {
      toast.error("Erro ao promover usuário: " + error.message);
    },
  });

  const getInitials = (nome: string) => {
    if (!nome) return "?";
    return nome
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const handleRevogar = (master: Master) => {
    setMasterSelecionado(master);
    setShowRevogarDialog(true);
  };

  const handleReativar = (master: Master) => {
    setMasterSelecionado(master);
    setShowReativarDialog(true);
  };

  const confirmarRevogacao = () => {
    if (masterSelecionado) {
      revogarMutation.mutate({
        masterId: masterSelecionado.user_id,
        motivo: motivoRevogacao,
      });
    }
  };

  const confirmarReativacao = () => {
    if (masterSelecionado) {
      reativarMutation.mutate(masterSelecionado.user_id);
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Shield className="w-8 h-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold">Gerenciar Masters</h1>
            <p className="text-muted-foreground">
              Promova e gerencie usuários com permissões Master
            </p>
          </div>
        </div>

        {/* Estatísticas */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Masters Ativos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats?.totalMasters || 0}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Normalizações Hoje
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats?.normHoje || 0}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Normalizações do Mês
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-primary">
                {stats?.normMes || 0}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs: Ativos / Revogados */}
        <Tabs defaultValue="ativos" className="space-y-4">
          <TabsList>
            <TabsTrigger value="ativos">Masters Ativos ({mastersAtivos.length})</TabsTrigger>
            <TabsTrigger value="revogados">Masters Revogados ({mastersRevogados.length})</TabsTrigger>
          </TabsList>

          {/* Tab: Masters Ativos */}
          <TabsContent value="ativos" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>👥 Masters Ativos</CardTitle>
                <CardDescription>
                  Usuários com permissão para normalizar produtos
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingAtivos ? (
                  <p className="text-center text-muted-foreground">Carregando...</p>
                ) : mastersAtivos.length === 0 ? (
                  <p className="text-center text-muted-foreground">
                    Nenhum Master ativo encontrado
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Usuário</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Promovido em</TableHead>
                        <TableHead className="text-right">Normalizações</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {mastersAtivos.map((master) => (
                        <TableRow key={master.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Avatar>
                                <AvatarImage src={master.profiles.avatar_url} />
                                <AvatarFallback>
                                  {getInitials(master.profiles.nome)}
                                </AvatarFallback>
                              </Avatar>
                              <span className="font-medium">{master.profiles.nome}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {master.profiles.email}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {format(new Date(master.created_at), "dd/MM/yyyy", {
                              locale: ptBR,
                            })}
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge variant="secondary">
                              <TrendingUp className="w-3 h-3 mr-1" />
                              {master.total_normalizacoes}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleRevogar(master)}
                              disabled={master.user_id === user?.id}
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Revogar
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* Promover Novo Master */}
            <Card>
              <CardHeader>
                <CardTitle>➕ Promover Novo Master</CardTitle>
                <CardDescription>
                  Busque um usuário por nome ou email para promovê-lo a Master
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Buscar Usuário</Label>
                  <Combobox
                    value={selectedUserId}
                    onValueChange={(value) => {
                      setSelectedUserId(value);
                    }}
                    onSearchChange={(search) => {
                      setSearchQuery(search);
                    }}
                    options={usuariosDisponiveis.map((user) => ({
                      value: user.user_id,
                      label: `${user.nome} - ${user.email}`,
                    }))}
                    placeholder="Selecione um usuário..."
                    searchPlaceholder="Digite nome ou email do usuário..."
                    emptyText="Nenhum usuário encontrado"
                    className="w-full"
                    isLoading={loadingUsuarios}
                  />
                  <p className="text-xs text-muted-foreground">
                    Digite pelo menos 2 caracteres para iniciar a busca
                  </p>
                </div>

                {usuarioSelecionado && (
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Avatar className="w-12 h-12">
                            <AvatarImage src={usuarioSelecionado.avatar_url} />
                            <AvatarFallback>
                              {getInitials(usuarioSelecionado.nome)}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">{usuarioSelecionado.nome}</p>
                            <p className="text-sm text-muted-foreground">
                              {usuarioSelecionado.email}
                            </p>
                          </div>
                        </div>
                        <Button
                          onClick={() => promoverMutation.mutate(usuarioSelecionado.user_id)}
                          disabled={promoverMutation.isPending}
                        >
                          <UserPlus className="w-4 h-4 mr-2" />
                          Promover a Master
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab: Masters Revogados */}
          <TabsContent value="revogados">
            <Card>
              <CardHeader>
                <CardTitle>🚫 Masters Revogados</CardTitle>
                <CardDescription>
                  Usuários que tiveram a role Master revogada
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingRevogados ? (
                  <p className="text-center text-muted-foreground">Carregando...</p>
                ) : mastersRevogados.length === 0 ? (
                  <p className="text-center text-muted-foreground">
                    Nenhum Master revogado encontrado
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Usuário</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Revogado em</TableHead>
                        <TableHead>Motivo</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {mastersRevogados.map((master) => (
                        <TableRow key={master.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Avatar>
                                <AvatarImage src={master.profiles.avatar_url} />
                                <AvatarFallback>
                                  {getInitials(master.profiles.nome)}
                                </AvatarFallback>
                              </Avatar>
                              <span className="font-medium">{master.profiles.nome}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {master.profiles.email}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {master.revogado_em
                              ? format(new Date(master.revogado_em), "dd/MM/yyyy", {
                                  locale: ptBR,
                                })
                              : "-"}
                          </TableCell>
                          <TableCell className="text-muted-foreground max-w-xs truncate">
                            {master.motivo_revogacao || "-"}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleReativar(master)}
                            >
                              <RotateCcw className="w-4 h-4 mr-2" />
                              Reativar
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Dialog de Revogação */}
      <AlertDialog open={showRevogarDialog} onOpenChange={setShowRevogarDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revogar Role Master?</AlertDialogTitle>
            <AlertDialogDescription>
              Você está prestes a revogar a role Master de{" "}
              <strong>{masterSelecionado?.profiles.nome}</strong>.
              <br />
              <br />
              Esta ação:
              <ul className="list-disc list-inside mt-2">
                <li>Remove o acesso ao painel de normalização</li>
                <li>Mantém o histórico de normalizações</li>
                <li>Pode ser revertida posteriormente</li>
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-2">
            <Label htmlFor="motivo">Motivo da revogação (opcional)</Label>
            <Textarea
              id="motivo"
              placeholder="Ex: Solicitado pelo usuário, inatividade, etc."
              value={motivoRevogacao}
              onChange={(e) => setMotivoRevogacao(e.target.value)}
              rows={3}
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmarRevogacao}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Confirmar Revogação
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog de Reativação */}
      <AlertDialog open={showReativarDialog} onOpenChange={setShowReativarDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reativar Master?</AlertDialogTitle>
            <AlertDialogDescription>
              Você está prestes a reativar a role Master de{" "}
              <strong>{masterSelecionado?.profiles.nome}</strong>.
              <br />
              <br />O usuário recuperará acesso ao painel de normalização.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarReativacao}>
              Confirmar Reativação
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
