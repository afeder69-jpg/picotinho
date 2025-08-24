import { Button } from "@/components/ui/button";
import { ArrowRight, FileText, Menu, QrCode } from "lucide-react";
import QRCodeScanner from "./QRCodeScanner";
import { useQRScanner } from "@/hooks/useQRScanner";

const BottomNavigation = () => {
  const { isOpen, openScanner, closeScanner, handleScanSuccess } = useQRScanner();

  return (
    <>
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
          onClick={openScanner}
        >
          <QrCode className="w-4 h-4 mr-2" />
          Escanear QR
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
      
      <QRCodeScanner
        isOpen={isOpen}
        onClose={closeScanner}
        onScanSuccess={handleScanSuccess}
      />
    </>
  );
};

export default BottomNavigation;