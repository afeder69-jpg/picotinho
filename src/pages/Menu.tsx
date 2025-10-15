import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import PicotinhoLogo from "@/components/PicotinhoLogo";
import { 
  FileImage, 
  ChevronRight, 
  Package, 
  TrendingDown, 
  BarChart3, 
  ChefHat, 
  ShoppingCart,
  LogIn,
  LogOut,
  MapPin,
  Settings,
  Database,
  Shield,
  Calendar
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/components/auth/AuthProvider";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";


const Menu = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [isMaster, setIsMaster] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    async function checkRoles() {
      if (!user?.id) return;

      const { data: roles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .is('revogado_em', null);

      if (roles) {
        setIsMaster(roles.some(r => r.role === 'master'));
        setIsAdmin(roles.some(r => r.role === 'admin'));
      }
    }
    
    checkRoles();
  }, [user]);

  const handleSignOut = async () => {
    try {
      await signOut();
      toast.success("Logout realizado com sucesso!");
    } catch (error) {
      toast.error("Erro ao fazer logout");
    }
  };

  const menuOptions = [
    {
      id: 'saved-pages',
      title: 'Minhas Notas Salvas',
      description: 'Visualizar screenshots capturados via QR Code',
      icon: FileImage,
      onClick: () => navigate('/screenshots'),
      isActive: true
    },
    {
      id: 'current-stock',
      title: 'Estoque',
      description: 'Consultar e ajustar produtos em estoque',
      icon: Package,
      onClick: () => navigate('/estoque'),
      isActive: true
    },
    {
      id: 'shopping-list',
      title: 'Lista de Compras',
      description: 'Organizar próximas compras',
      icon: ShoppingCart,
      onClick: () => {},
      isActive: false
    },
    {
      id: 'reports',
      title: 'Relatórios',
      description: 'Visualizar Relatórios de Compras, Consumo e Estoque',
      icon: BarChart3,
      onClick: () => navigate('/relatorios'),
      isActive: true
    },
    {
      id: 'recipes',
      title: 'Receitas',
      description: 'Gerenciar receitas e ingredientes',
      icon: ChefHat,
      onClick: () => navigate('/receitas'),
      isActive: true
    },
    {
      id: 'cardapios',
      title: 'Cardápios',
      description: 'Planejar refeições semanais',
      icon: Calendar,
      onClick: () => navigate('/cardapios'),
      isActive: true
    },
    {
      id: 'user-settings',
      title: 'Configurações do Usuário',
      description: 'Gerenciar configurações pessoais',
      icon: Settings,
      onClick: () => navigate('/configuracoes'),
      isActive: true
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-subtle flex flex-col pb-32">
      {/* Header com logo e botão de login/logout */}
      <div className="flex justify-between items-center p-4">
        <PicotinhoLogo />
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
            Entrar
          </Button>
        )}
      </div>

      {/* Main content area */}
      <div className="flex-1 px-6 pb-8">
        <div className="max-w-md mx-auto">
          
          {/* Painel Master - Exclusivo */}
          {isMaster && (
            <Card 
              className="mb-6 border-2 border-primary cursor-pointer transition-all duration-200 hover:shadow-lg bg-gradient-to-r from-primary/5 to-primary/10"
              onClick={() => navigate('/admin/normalizacao')}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-3 rounded-full bg-primary/20">
                      <Database className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-bold text-primary flex items-center gap-2">
                        Normalização Global
                        <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded">
                          MASTER
                        </span>
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Sistema de normalização global de produtos
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-primary" />
                </div>
              </CardContent>
            </Card>
          )}

          
          <div className="space-y-3">
            {menuOptions.map((option) => (
              <Card 
                key={option.id}
                className={`transition-all duration-200 hover:shadow-md ${
                  option.isActive ? 'cursor-pointer' : 'cursor-default opacity-75'
                }`}
                onClick={option.isActive ? option.onClick : undefined}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`p-3 rounded-full ${
                        option.isActive ? 'bg-primary/10' : 'bg-muted'
                      }`}>
                        <option.icon className={`w-6 h-6 ${
                          option.isActive ? 'text-primary' : 'text-muted-foreground'
                        }`} />
                      </div>
                      <div>
                        <h3 className={`font-semibold ${
                          option.isActive ? 'text-foreground' : 'text-muted-foreground'
                        }`}>
                          {option.title}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {option.description}
                        </p>
                        {!option.isActive && (
                          <p className="text-xs text-muted-foreground/70 mt-1">
                            Em breve
                          </p>
                        )}
                      </div>
                    </div>
                    {option.isActive && (
                      <ChevronRight className="w-5 h-5 text-muted-foreground" />
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          
          
          {/* Mensagem informativa */}
          <div className="mt-6 p-4 text-center text-muted-foreground bg-muted/30 rounded-lg">
            <p className="text-sm">
              Novas funcionalidades serão adicionadas em breve
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Menu;