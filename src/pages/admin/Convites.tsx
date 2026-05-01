import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, RefreshCw, Plus, Copy, Ban, Loader2, Unlock, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";

type StatusConvite = "disponivel" | "reservado" | "usado" | "cancelado";

interface Convite {
  id: string;
  codigo: string;
  email_destino: string | null;
  status: StatusConvite;
  created_at: string;
  expira_em: string | null;
  usado_por: string | null;
  usado_em: string | null;
  cancelado_em?: string | null;
}

function gerarCodigoAleatorio(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < 8; i++) out += chars[bytes[i] % chars.length];
  return out;
}

function formatarData(dt: string | null | undefined): string {
  if (!dt) return "—";
  try {
    return new Date(dt).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

const statusBadgeVariant: Record<StatusConvite, "default" | "secondary" | "destructive" | "outline"> = {
  disponivel: "default",
  reservado: "secondary",
  usado: "outline",
  cancelado: "destructive",
};

const statusLabel: Record<StatusConvite, string> = {
  disponivel: "Disponível",
  reservado: "Reservado",
  usado: "Usado",
  cancelado: "Cancelado",
};

export default function Convites() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [carregandoRole, setCarregandoRole] = useState(true);
  const [isMaster, setIsMaster] = useState(false);

  const [convites, setConvites] = useState<Convite[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [criando, setCriando] = useState(false);
  const [filtroStatus, setFiltroStatus] = useState<"todos" | StatusConvite>("todos");

  const [novoCodigo, setNovoCodigo] = useState<string>(gerarCodigoAleatorio());
  const [novoEmail, setNovoEmail] = useState("");
  const [novoExpira, setNovoExpira] = useState("");

  const [apelidos, setApelidos] = useState<Record<string, string>>({});

  const [conviteParaCancelar, setConviteParaCancelar] = useState<Convite | null>(null);
  const [cancelando, setCancelando] = useState(false);

  // Verifica role master
  useEffect(() => {
    let cancel = false;
    async function verificar() {
      if (!user?.id) {
        setCarregandoRole(false);
        return;
      }
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .is("revogado_em", null);
      if (cancel) return;
      if (error) {
        console.error("Erro ao verificar role:", error);
        toast.error("Erro ao verificar permissões.");
        setCarregandoRole(false);
        return;
      }
      const ehMaster = (data || []).some((r) => r.role === "master");
      setIsMaster(ehMaster);
      setCarregandoRole(false);
      if (!ehMaster) {
        toast.error("Acesso restrito a usuários master.");
        navigate("/menu", { replace: true });
      }
    }
    verificar();
    return () => {
      cancel = true;
    };
  }, [user, navigate]);

  async function carregarConvites() {
    setCarregando(true);
    const { data, error } = await supabase
      .from("convites_acesso")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) {
      console.error(error);
      toast.error("Erro ao carregar convites.");
      setCarregando(false);
      return;
    }
    const lista = (data || []) as Convite[];
    setConvites(lista);

    // Buscar apelidos de quem usou
    const userIds = Array.from(new Set(lista.map((c) => c.usado_por).filter(Boolean))) as string[];
    if (userIds.length > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id, apelido")
        .in("user_id", userIds);
      const map: Record<string, string> = {};
      (profs || []).forEach((p: any) => {
        if (p.user_id) map[p.user_id] = p.apelido || "—";
      });
      setApelidos(map);
    }
    setCarregando(false);
  }

  useEffect(() => {
    if (isMaster) carregarConvites();
  }, [isMaster]);

  async function criarConvite() {
    const codigo = (novoCodigo || "").toUpperCase().trim();
    if (!/^[A-Z0-9]{8}$/.test(codigo)) {
      toast.error("Código deve ter 8 caracteres (A-Z, 0-9).");
      return;
    }
    const emailNorm = novoEmail.trim().toLowerCase();
    if (emailNorm && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) {
      toast.error("E-mail inválido.");
      return;
    }
    let expiraEm: string | null = null;
    if (novoExpira) {
      const dt = new Date(novoExpira);
      if (isNaN(dt.getTime())) {
        toast.error("Data de expiração inválida.");
        return;
      }
      // Considera fim do dia escolhido
      dt.setHours(23, 59, 59, 999);
      if (dt.getTime() < Date.now()) {
        toast.error("Data de expiração deve ser futura.");
        return;
      }
      expiraEm = dt.toISOString();
    }

    setCriando(true);
    const { error } = await supabase.from("convites_acesso").insert({
      codigo,
      email_destino: emailNorm || null,
      expira_em: expiraEm,
      status: "disponivel",
      criado_por: user?.id ?? null,
    });
    setCriando(false);

    if (error) {
      if ((error as any).code === "23505") {
        toast.error("Este código já existe. Gere outro.");
      } else {
        console.error(error);
        toast.error("Erro ao criar convite.");
      }
      return;
    }

    toast.success(`Convite ${codigo} criado!`);
    setNovoCodigo(gerarCodigoAleatorio());
    setNovoEmail("");
    setNovoExpira("");
    carregarConvites();
  }

  async function cancelarConvite() {
    if (!conviteParaCancelar) return;
    setCancelando(true);
    const { error } = await supabase
      .from("convites_acesso")
      .update({
        status: "cancelado",
        token_temp: null,
        token_expira_em: null,
      })
      .eq("id", conviteParaCancelar.id)
      .in("status", ["disponivel", "reservado"]);
    setCancelando(false);

    if (error) {
      console.error(error);
      toast.error("Erro ao cancelar convite.");
      return;
    }
    toast.success("Convite cancelado.");
    setConviteParaCancelar(null);
    carregarConvites();
  }

  async function liberarReserva(c: Convite) {
    if (c.status !== "reservado") return;
    const { data, error } = await supabase
      .from("convites_acesso")
      .update({
        status: "disponivel",
        token_temp: null,
        token_expira_em: null,
      })
      .eq("id", c.id)
      .eq("status", "reservado")
      .select("id");
    if (error) {
      console.error(error);
      toast.error("Erro ao liberar reserva.");
      return;
    }
    if (!data || data.length === 0) {
      toast.error("Convite não pôde ser liberado (status mudou).");
      carregarConvites();
      return;
    }
    toast.success(`Convite ${c.codigo} liberado.`);
    carregarConvites();
  }

  function copiarCodigo(codigo: string) {
    navigator.clipboard.writeText(codigo).then(
      () => toast.success(`Código ${codigo} copiado!`),
      () => toast.error("Não foi possível copiar."),
    );
  }

  const convitesFiltrados = useMemo(() => {
    if (filtroStatus === "todos") return convites;
    return convites.filter((c) => c.status === filtroStatus);
  }, [convites, filtroStatus]);

  if (carregandoRole) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isMaster) return null;

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/menu")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-lg font-semibold flex-1">Convites de Acesso</h1>
          <Button variant="outline" size="sm" onClick={() => navigate("/admin/controle-acesso")}>
            <Shield className="w-4 h-4 mr-2" /> Controle de Acesso
          </Button>
          <Button variant="outline" size="sm" onClick={carregarConvites} disabled={carregando}>
            <RefreshCw className={`w-4 h-4 ${carregando ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto p-4 space-y-6">
        {/* Card gerar */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Gerar novo convite</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label htmlFor="codigo">Código</Label>
                <div className="flex gap-2">
                  <Input
                    id="codigo"
                    value={novoCodigo}
                    onChange={(e) => setNovoCodigo(e.target.value.toUpperCase())}
                    maxLength={8}
                    placeholder="ABC12345"
                    className="font-mono"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setNovoCodigo(gerarCodigoAleatorio())}
                    title="Gerar novo código"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="email">E-mail destino (opcional)</Label>
                <Input
                  id="email"
                  type="email"
                  value={novoEmail}
                  onChange={(e) => setNovoEmail(e.target.value)}
                  placeholder="usuario@exemplo.com"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="expira">Expira em (opcional)</Label>
                <Input
                  id="expira"
                  type="date"
                  value={novoExpira}
                  onChange={(e) => setNovoExpira(e.target.value)}
                />
              </div>
            </div>
            <Button onClick={criarConvite} disabled={criando} className="w-full sm:w-auto">
              {criando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
              Criar convite
            </Button>
          </CardContent>
        </Card>

        {/* Lista */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle className="text-base">Convites ({convitesFiltrados.length})</CardTitle>
            <Select value={filtroStatus} onValueChange={(v) => setFiltroStatus(v as any)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filtrar status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="disponivel">Disponíveis</SelectItem>
                <SelectItem value="reservado">Reservados</SelectItem>
                <SelectItem value="usado">Usados</SelectItem>
                <SelectItem value="cancelado">Cancelados</SelectItem>
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent>
            {carregando ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : convitesFiltrados.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">
                Nenhum convite encontrado.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>E-mail</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Criado em</TableHead>
                      <TableHead>Expira em</TableHead>
                      <TableHead>Usado por / em</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {convitesFiltrados.map((c) => {
                      const podeCancelar = c.status === "disponivel" || c.status === "reservado";
                      return (
                        <TableRow key={c.id}>
                          <TableCell className="font-mono font-semibold">{c.codigo}</TableCell>
                          <TableCell className="text-sm">{c.email_destino || "—"}</TableCell>
                          <TableCell>
                            <Badge variant={statusBadgeVariant[c.status]}>
                              {statusLabel[c.status]}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm whitespace-nowrap">
                            {formatarData(c.created_at)}
                          </TableCell>
                          <TableCell className="text-sm whitespace-nowrap">
                            {formatarData(c.expira_em)}
                          </TableCell>
                          <TableCell className="text-sm">
                            {c.usado_por ? (
                              <div className="flex flex-col">
                                <span>{apelidos[c.usado_por] || c.usado_por.slice(0, 8)}</span>
                                <span className="text-xs text-muted-foreground">
                                  {formatarData(c.usado_em)}
                                </span>
                              </div>
                            ) : (
                              "—"
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => copiarCodigo(c.codigo)}
                                title="Copiar código"
                              >
                                <Copy className="w-4 h-4" />
                              </Button>
                              {c.status === "reservado" && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => liberarReserva(c)}
                                  title="Liberar reserva (volta para disponível)"
                                >
                                  <Unlock className="w-4 h-4" />
                                </Button>
                              )}
                              {podeCancelar && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setConviteParaCancelar(c)}
                                  title="Cancelar convite"
                                >
                                  <Ban className="w-4 h-4 text-destructive" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <AlertDialog
        open={!!conviteParaCancelar}
        onOpenChange={(open) => !open && setConviteParaCancelar(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar convite?</AlertDialogTitle>
            <AlertDialogDescription>
              O código <span className="font-mono font-semibold">{conviteParaCancelar?.codigo}</span>{" "}
              será marcado como cancelado e não poderá mais ser utilizado. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelando}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                cancelarConvite();
              }}
              disabled={cancelando}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cancelando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Cancelar convite
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
