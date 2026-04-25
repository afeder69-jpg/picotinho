import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, ShieldOff } from 'lucide-react';

// 🛑 PÁGINA DESATIVADA POR SEGURANÇA — Fase 1 trava de proteção do estoque.
// A função cleanup-user-data foi neutralizada (HTTP 410) por executar
// DELETE em massa em estoque_app, notas, receipts, etc.
// Mantemos a rota apenas como aviso para histórico.
export default function CleanupUserData() {
  const [isPageLoaded, setIsPageLoaded] = useState(false);
  useEffect(() => { setIsPageLoaded(true); }, []);

  if (!isPageLoaded) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p>Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <ShieldOff className="h-5 w-5" />
              Função desativada por segurança
            </CardTitle>
            <CardDescription>
              Esta página executava uma limpeza completa de dados (DELETE em massa em estoque,
              notas e recibos), violando a regra de ouro do projeto.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/30">
              <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
              <p>
                A edge function <code className="font-mono">cleanup-user-data</code> foi
                neutralizada (HTTP 410). Para apenas zerar o estoque preservando o histórico,
                use o botão <strong>Limpar Estoque</strong> em <code className="font-mono">/estoque</code>,
                que chama a RPC segura <code className="font-mono">limpar_estoque_usuario</code>.
              </p>
            </div>
            <p className="text-muted-foreground">
              Exclusão total de conta deve ser fluxo dedicado, com confirmação forte e
              ativação explícita da válvula <code className="font-mono">app.allow_bulk_delete</code>.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
