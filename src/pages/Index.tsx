import { useState } from "react";
import BottomNavigation from "@/components/BottomNavigation";
import QRCodeScanner from "@/components/QRCodeScanner";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const Index = () => {
  const [showScanner, setShowScanner] = useState(false);

  const handleScanSuccess = (result: string) => {
    toast.success(`QR Code escaneado: ${result}`);
    setShowScanner(false);
  };

  const handleCloseScanner = () => {
    setShowScanner(false);
  };

  return (
    <div className="min-h-screen bg-gradient-subtle flex flex-col">
      {/* Main content area */}
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="text-center max-w-md mx-auto space-y-8">
          <h1 className="text-2xl font-bold text-foreground leading-tight">
            Bem-vindo ao Picotinho, a sua rede compartilhada de preços
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
