import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { toast } from "sonner";
import { Shield, Crown } from "lucide-react";

export default function SetupMaster() {
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();

  const setupMasterUser = async () => {
    if (!user) {
      toast.error("Você precisa estar logado");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('setup-master-user');
      
      if (error) {
        throw error;
      }

      toast.success("Usuário Master configurado com sucesso!");
      console.log("Setup Master resultado:", data);
      
      // Recarregar a página para atualizar as permissões
      setTimeout(() => {
        window.location.reload();
      }, 1500);

    } catch (error: any) {
      console.error('Erro ao configurar Master:', error);
      toast.error("Erro ao configurar usuário Master");
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-subtle flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 text-center">
            <p>Você precisa estar logado para acessar esta página.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-subtle flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <Crown className="h-12 w-12 text-yellow-500" />
          </div>
          <CardTitle className="flex items-center justify-center gap-2">
            <Shield className="h-5 w-5" />
            Configurar Usuário Master
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-center space-y-2">
            <p className="text-sm text-muted-foreground">
              Usuário atual: <strong>{user.email}</strong>
            </p>
            <p className="text-sm text-muted-foreground">
              Clique no botão abaixo para se tornar o usuário Master do sistema.
            </p>
            <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded">
              ⚠️ Esta é uma função administrativa que permite acesso total ao sistema de normalização.
            </p>
          </div>

          <Button 
            onClick={setupMasterUser}
            disabled={loading}
            className="w-full"
            size="lg"
          >
            {loading ? "Configurando..." : "Tornar-se Master"}
          </Button>

          <div className="text-center">
            <p className="text-xs text-muted-foreground">
              Após a configuração, você terá acesso à página de revisão de normalização para todos os usuários do sistema.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}