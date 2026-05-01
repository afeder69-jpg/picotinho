import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Lock, Unlock, Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { useAppConfig } from "@/hooks/useAppConfig";

interface LogRow {
  id: string;
  alterado_por: string;
  email: string | null;
  valor_anterior: boolean;
  valor_novo: boolean;
  alterado_em: string;
}

function formatarData(dt: string): string {
  try {
    return new Date(dt).toLocaleString("pt-BR", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return "—"; }
}

export default function ControleAcesso() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { acessoRestrito, isLoading: configLoading } = useAppConfig();
  const queryClient = useQueryClient();

  const [carregandoRole, setCarregandoRole] = useState(true);
  const [isMaster, setIsMaster] = useState(false);

  const [logs, setLogs] = useState<LogRow[]>([]);
  const [carregandoLogs, setCarregandoLogs] = useState(false);

  const [dialogAberto, setDialogAberto] = useState(false);
  const [senha, setSenha] = useState("");
  const [enviando, setEnviando] = useState(false);

  // Verifica role master
  useEffect(() => {
    let cancel = false;
    async function verificar() {
      if (!user?.id) { setCarregandoRole(false); return; }
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .is("revogado_em", null);
      if (cancel) return;
      if (error) {
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
    return () => { cancel = true; };
  }, [user, navigate]);

  async function carregarLogs() {
    setCarregandoLogs(true);
    const { data, error } = await supabase
      .from("acesso_restrito_log")
      .select("*")
      .order("alterado_em", { ascending: false })
      .limit(20);
    if (error) {
      console.error(error);
      toast.error("Erro ao carregar histórico.");
    } else {
      setLogs((data || []) as LogRow[]);
    }
    setCarregandoLogs(false);
  }

  useEffect(() => { if (isMaster) carregarLogs(); }, [isMaster]);

  async function confirmarAlteracao() {
    if (!senha) {
      toast.error("Informe sua senha para confirmar.");
      return;
    }
    setEnviando(true);
    try {
      const novoValor = !acessoRestrito;
      const { data, error } = await supabase.functions.invoke("toggle-acesso-restrito", {
        body: { novo_valor: novoValor, senha },
      });
      if (error || !data?.ok) {
        const motivo = (data as any)?.motivo;
        if (motivo === "senha_invalida") {
          toast.error("Senha incorreta. Tente novamente.");
        } else {
          toast.error(`Não foi possível alterar: ${motivo || error?.message || "erro desconhecido"}`);
        }
        return;
      }
      toast.success(
        novoValor
          ? "Acesso restrito ATIVADO. Cadastros agora exigem convite."
          : "Acesso restrito DESATIVADO. Cadastros liberados."
      );
      setSenha("");
      setDialogAberto(false);
      await queryClient.invalidateQueries({ queryKey: ["app_config"] });
      carregarLogs();
    } catch (e: any) {
      toast.error(e?.message || "Erro inesperado.");
    } finally {
      setEnviando(false);
    }
  }

  if (carregandoRole || configLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  if (!isMaster) return null;

  return (
    <div className="min-h-screen bg-background p-4 pb-24">
      <div className="max-w-3xl mx-auto space-y-6">
        <Button variant="ghost" size="sm" onClick={() => navigate("/menu")}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Voltar
        </Button>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {acessoRestrito ? <ShieldAlert className="w-5 h-5 text-destructive" /> : <ShieldCheck className="w-5 h-5 text-primary" />}
              Controle de Acesso
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4 p-4 rounded-lg border bg-muted/30">
              <div>
                <div className="text-sm text-muted-foreground mb-1">Status atual</div>
                {acessoRestrito ? (
                  <Badge variant="destructive" className="text-base">🔒 Acesso Restrito ATIVO</Badge>
                ) : (
                  <Badge variant="default" className="text-base">🔓 Acesso Liberado</Badge>
                )}
              </div>
              <Button
                variant={acessoRestrito ? "default" : "destructive"}
                onClick={() => setDialogAberto(true)}
              >
                {acessoRestrito ? <><Unlock className="w-4 h-4 mr-2" /> Desativar restrição</>
                                 : <><Lock className="w-4 h-4 mr-2" /> Ativar restrição</>}
              </Button>
            </div>

            <div className="text-sm text-muted-foreground">
              {acessoRestrito ? (
                <p>Com o acesso restrito ativo, <strong>somente usuários com convite válido</strong> podem se cadastrar — independente do método (e-mail, Google, Facebook). Login de usuários já existentes funciona normalmente.</p>
              ) : (
                <p>Com o acesso liberado, <strong>qualquer pessoa pode se cadastrar</strong> sem convite. Use este modo apenas em campanhas controladas.</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Histórico de alterações</CardTitle>
          </CardHeader>
          <CardContent>
            {carregandoLogs ? (
              <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin" /></div>
            ) : logs.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhuma alteração registrada.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Quem alterou</TableHead>
                    <TableHead>De</TableHead>
                    <TableHead>Para</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell>{formatarData(l.alterado_em)}</TableCell>
                      <TableCell className="text-xs">{l.email || l.alterado_por.slice(0, 8)}</TableCell>
                      <TableCell>{l.valor_anterior ? "🔒 Restrito" : "🔓 Liberado"}</TableCell>
                      <TableCell>{l.valor_novo ? "🔒 Restrito" : "🔓 Liberado"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={dialogAberto} onOpenChange={(open) => { if (!enviando) setDialogAberto(open); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {acessoRestrito ? "Desativar acesso restrito?" : "Ativar acesso restrito?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {acessoRestrito
                ? "Qualquer pessoa poderá se cadastrar sem convite. Confirme sua senha para prosseguir."
                : "Apenas pessoas com convite válido poderão se cadastrar. Confirme sua senha para prosseguir."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="confirma-senha">Sua senha</Label>
            <Input
              id="confirma-senha"
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              autoComplete="current-password"
              disabled={enviando}
              onKeyDown={(e) => { if (e.key === "Enter") confirmarAlteracao(); }}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={enviando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); confirmarAlteracao(); }}
              disabled={enviando || !senha}
            >
              {enviando ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Confirmando...</> : "Confirmar alteração"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
