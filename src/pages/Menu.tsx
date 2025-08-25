import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { 
  FileImage, 
  ChevronRight, 
  Package, 
  TrendingDown, 
  BarChart3, 
  ChefHat, 
  ShoppingCart 
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import BottomNavigation from "@/components/BottomNavigation";
import CameraTest from "@/components/CameraTest";

const Menu = () => {
  const navigate = useNavigate();

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
      title: 'Estoque Atual',
      description: 'Consultar produtos em estoque',
      icon: Package,
      onClick: () => {},
      isActive: false
    },
    {
      id: 'stock-out',
      title: 'Baixa de Estoque',
      description: 'Registrar saída de produtos',
      icon: TrendingDown,
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
      id: 'shopping-list',
      title: 'Lista de Compras',
      description: 'Organizar próximas compras',
      icon: ShoppingCart,
      onClick: () => {},
      isActive: false
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-subtle flex flex-col">
      {/* Main content area */}
      <div className="flex-1 px-6 pt-8 pb-24">
        <div className="max-w-md mx-auto">
          <h1 className="text-2xl font-bold text-foreground mb-8">
            Menu Principal
          </h1>
          
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
          
          {/* Teste da câmera */}
          <div className="mt-6">
            <CameraTest />
          </div>
          
          {/* Mensagem informativa */}
          <div className="mt-6 p-4 text-center text-muted-foreground bg-muted/30 rounded-lg">
            <p className="text-sm">
              Novas funcionalidades serão adicionadas em breve
            </p>
          </div>
        </div>
      </div>
      
      {/* Bottom navigation */}
      <BottomNavigation />
    </div>
  );
};

export default Menu;