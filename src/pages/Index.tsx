import { useState } from "react";
import { useNavigate } from "react-router-dom";
import BottomNavigation from "@/components/BottomNavigation";
import QRCodeScanner from "@/components/QRCodeScanner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/AuthProvider";
import { LogIn, LogOut } from "lucide-react";
import { toast } from "sonner";

const Index = () => {
  const [showScanner, setShowScanner] = useState(false);
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleScanSuccess = (result: string) => {
    toast.success(`QR Code escaneado: ${result}`);
    setShowScanner(false);
  };

  const handleCloseScanner = () => {
    setShowScanner(false);
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      toast.success("Logout realizado com sucesso!");
    } catch (error) {
      toast.error("Erro ao fazer logout");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-subtle flex flex-col">
      {/* Header com botão de login/logout */}
      <div className="flex justify-end p-4">
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
          <h1 className="text-2xl font-bold text-foreground leading-tight">
            Bem-vindo ao Notinha, gerencie suas compras de supermercado
          </h1>
          
          {/* QR Scanner Button */}
          <div className="flex justify-center">
            <Button 
              onClick={() => {
                console.log("Botão clicado - abrindo scanner");
                setShowScanner(true);
              }}
              className="w-24 h-24 bg-sky-400 hover:bg-sky-500 rounded-full text-white font-bold shadow-lg animate-pulse hover:animate-none transition-all duration-300"
            >
              Escanear QR Code
            </Button>
          </div>

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
      
      {/* Bottom navigation */}
      <BottomNavigation />
      
      {/* QR Code Scanner */}
      <QRCodeScanner 
        isOpen={showScanner}
        onScanSuccess={handleScanSuccess}
        onClose={handleCloseScanner}
      />
      
      {/* Spacer for fixed bottom navigation */}
      <div className="h-20"></div>
    </div>
  );
};

export default Index;
