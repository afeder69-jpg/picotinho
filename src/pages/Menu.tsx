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
  Settings
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/components/auth/AuthProvider";
import { toast } from "sonner";


const Menu = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

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
      description: 'Visualizar relatórios de vendas e estoque',
      icon: BarChart3,
      onClick: () => {},
      isActive: false
    },
    {
      id: 'recipes',
      title: 'Receitas',
      description: 'Gerenciar receitas e ingredientes',
      icon: ChefHat,
      onClick: () => {},
      isActive: false
    },
    {
      id: 'user-settings',
      title: 'Configurações do Usuário',
      description: 'Gerenciar configurações pessoais',
      icon: Settings,
      onClick: () => navigate('/configuracoes'),
      isActive: true
    }
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