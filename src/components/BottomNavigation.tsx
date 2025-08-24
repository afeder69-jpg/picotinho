import { Button } from "@/components/ui/button";
import { ArrowRight, FileText, Menu, QrCode } from "lucide-react";
import QRCodeScanner from "./QRCodeScanner";
import ScreenCaptureComponent from "./ScreenCaptureComponent";
import { useQRScanner } from "@/hooks/useQRScanner";
import { useState } from "react";

const BottomNavigation = () => {
  const { isOpen, openScanner, closeScanner, handleScanSuccess } = useQRScanner();
  const [showCaptureDialog, setShowCaptureDialog] = useState(false);

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
          onClick={() => setShowCaptureDialog(true)}
        >
          <Menu className="w-4 h-4 mr-2" />
          Menu
        </Button>
        </div>
      </div>
      
      {/* Dialog para captura de tela */}
      {showCaptureDialog && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card p-6 rounded-lg shadow-lg w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Capturar Nota Fiscal</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowCaptureDialog(false)}
              >
                ×
              </Button>
            </div>
            <ScreenCaptureComponent />
          </div>
        </div>
      )}
      
      <QRCodeScanner
        isOpen={isOpen}
        onClose={closeScanner}
        onScanSuccess={handleScanSuccess}
      />
    </>
  );
};

export default BottomNavigation;