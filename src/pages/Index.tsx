import { useNavigate } from "react-router-dom";

import PicotinhoLogo from "@/components/PicotinhoLogo";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/AuthProvider";
import { LogIn, LogOut } from "lucide-react";
import { toast } from "sonner";

const Index = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    try {
      await signOut();
      toast.success("Logout realizado com sucesso!");
    } catch (error) {
      toast.error("Erro ao fazer logout");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-subtle flex flex-col pb-32">
      {/* Header com logo e botão de login/logout */}
      <div className="flex justify-between items-center p-4 relative">
        <PicotinhoLogo />
        <div className="flex-1"></div> {/* Spacer */}
        {/* Indicador de versão APK */}
        <div className="absolute top-2 right-2 w-2 h-2 bg-green-500 rounded-full"></div>
        {user ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {user.email}
            </span>
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleSignOut}
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sair
            </Button>
          </div>
        ) : (
          <Button 
            variant="outline" 
            onClick={() => navigate('/auth')}
          >
            <LogIn className="w-4 h-4 mr-2" />
            Entrar / Cadastrar
          </Button>
        )}
      </div>

      {/* Main content area */}
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="text-center max-w-md mx-auto space-y-8">
          {/* Mascote do Picotinho */}
          <div className="flex justify-center">
            <img 
              src="/lovable-uploads/62443b56-2f57-4ca1-8797-db67febf5108.png" 
              alt="Mascote Picotinho" 
              className="w-32 h-32 object-contain"
            />
          </div>
          
          <h1 className="text-2xl font-bold text-foreground leading-tight">
            Bem-vindo ao Picotinho, gerencie suas compras de supermercado
          </h1>
          

          {!user && (
            <div className="text-center space-y-2">
              <p className="text-sm text-muted-foreground">
                Faça login para salvar suas notas fiscais
              </p>
              <Button 
                variant="outline" 
                onClick={() => navigate('/auth')}
                className="w-full"
              >
                Criar conta ou fazer login
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Index;
