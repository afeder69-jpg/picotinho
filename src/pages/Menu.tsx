import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FileImage, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import BottomNavigation from "@/components/BottomNavigation";

const Menu = () => {
  const navigate = useNavigate();

  const menuOptions = [
    {
      id: 'saved-pages',
      title: 'Páginas Salvas',
      description: 'Visualizar screenshots capturados via QR Code',
      icon: FileImage,
      onClick: () => navigate('/screenshots')
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
          
          <div className="space-y-4">
            {menuOptions.map((option) => (
              <Card 
                key={option.id}
                className="transition-all duration-200 hover:shadow-md cursor-pointer"
                onClick={option.onClick}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="p-3 rounded-full bg-primary/10">
                        <option.icon className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-foreground">
                          {option.title}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {option.description}
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          
          {/* Placeholder para futuras opções */}
          <div className="mt-8 p-4 text-center text-muted-foreground">
            <p className="text-sm">
              Mais opções serão adicionadas em breve...
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