import { Button } from "@/components/ui/button";
import { ArrowRight, FileText, Menu, QrCode } from "lucide-react";
import QRCodeScanner from "./QRCodeScanner";
import ScreenCaptureComponent from "./ScreenCaptureComponent";
import { useQRScanner } from "@/hooks/useQRScanner";
import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";

const BottomNavigation = () => {
  const { isOpen, openScanner, closeScanner, handleScanSuccess, isProcessing } = useQRScanner();
  const [showCaptureDialog, setShowCaptureDialog] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-sm border-t border-border p-4 safe-area-inset-bottom">
        <div className="flex justify-between items-center w-full max-w-screen-lg mx-auto gap-2 px-2">
          <Button
            variant="ghost"
            size="lg"
            className="flex-1 min-w-0 h-12 rounded-full font-medium text-xs sm:text-sm text-white border border-white/20 hover:bg-white/10"
            onClick={() => navigate('/')}
          >
            <ArrowRight className="w-4 h-4 mr-1 sm:mr-2 flex-shrink-0" />
            <span className="truncate">Início</span>
          </Button>
          
          <Button
            variant="default"
            size="lg"
            className="flex-1 min-w-0 h-12 rounded-full font-medium text-xs sm:text-sm bg-green-600 hover:bg-green-700 text-white border-0"
            onClick={openScanner}
            disabled={isProcessing}
          >
            <QrCode className="w-4 h-4 mr-1 sm:mr-2 flex-shrink-0" />
            <span className="truncate">
              {isProcessing ? "Processando..." : "Escanear QR"}
            </span>
          </Button>
          
          <Button
            variant="ghost"
            size="lg"
            className="flex-1 min-w-0 h-12 rounded-full font-medium text-xs sm:text-sm text-white border border-white/20 hover:bg-white/10"
            onClick={() => navigate('/menu')}
          >
            <Menu className="w-4 h-4 mr-1 sm:mr-2 flex-shrink-0" />
            <span className="truncate">Menu</span>
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