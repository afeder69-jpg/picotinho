import { Button } from "@/components/ui/button";
import { ArrowRight, FileText, Menu } from "lucide-react";

const BottomNavigation = () => {
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-sm border-t border-border p-4">
      <div className="flex justify-between items-center max-w-md mx-auto gap-3">
        <Button
          variant="secondary"
          size="lg"
          className="flex-1 h-12 rounded-full font-medium"
        >
          <ArrowRight className="w-4 h-4 mr-2" />
          Início
        </Button>
        
        <Button
          variant="default"
          size="lg"
          className="flex-1 h-12 rounded-full font-medium bg-gradient-primary shadow-button hover:shadow-lg transition-all duration-300"
        >
          <FileText className="w-4 h-4 mr-2" />
          Enviar Nota Fiscal
        </Button>
        
        <Button
          variant="outline"
          size="lg"
          className="flex-1 h-12 rounded-full font-medium"
        >
          <Menu className="w-4 h-4 mr-2" />
          Menu
        </Button>
      </div>
    </div>
  );
};

export default BottomNavigation;