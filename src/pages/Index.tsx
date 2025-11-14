import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

import PicotinhoLogo from "@/components/PicotinhoLogo";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/AuthProvider";
import { LogIn, LogOut } from "lucide-react";
import { toast } from "sonner";
import { APP_VERSION } from "@/lib/constants";
import { useProcessingNotes } from "@/contexts/ProcessingNotesContext";
import { ProcessingBadge } from "@/components/ProcessingBadge";

const Index = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [userNickname, setUserNickname] = useState<string>('');
  const { processingCount, processingStartTimes } = useProcessingNotes();

  // Carregar apelido quando usuário faz login
  useEffect(() => {
    if (user) {
      carregarApelido();
    }
  }, [user]);

  const carregarApelido = async () => {
    if (!user) return;
    
    try {
      const { data: profileData, error } = await supabase
        .from('profiles')
        .select('apelido')
        .eq('user_id', user.id)
        .single();

      if (error) {
        console.error('Erro ao carregar apelido:', error);
        // Se não encontrou o perfil, redirecionar para cadastro
        toast.error('Complete seu cadastro para continuar');
        setUserNickname('Visitante');
        navigate('/cadastro-usuario');
        return;
      }

      if (!profileData?.apelido || profileData.apelido.trim() === '') {
        // Usuário sem apelido - redirecionar para cadastro
        toast.error('Complete seu cadastro para continuar');
        setUserNickname('Visitante');
        navigate('/cadastro-usuario');
        return;
      }

      // Usuário com apelido válido
      setUserNickname(profileData.apelido);
      
    } catch (error) {
      console.error('Erro ao carregar apelido:', error);
      toast.error('Erro ao carregar dados do usuário');
      setUserNickname('Visitante');
      navigate('/cadastro-usuario');
    }
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
    <div className="min-h-screen bg-gradient-subtle flex flex-col pb-32">
      {/* Header com logo e botão de login/logout */}
      <div className="flex justify-between items-center p-4 relative">
        <PicotinhoLogo />
        <div className="flex-1"></div> {/* Spacer */}
        {/* Badge de versão APK */}
        <div className="absolute top-2 right-2 text-[10px] text-muted-foreground/60 font-mono">
          V {APP_VERSION}
        </div>
        {user ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {userNickname || 'Carregando...'}
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

      {/* Badge discreto de processamento */}
      {processingCount > 0 && processingStartTimes.size > 0 && (
        <ProcessingBadge 
          noteCount={processingCount}
          startTime={Math.min(...Array.from(processingStartTimes.values()))}
        />
      )}

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
