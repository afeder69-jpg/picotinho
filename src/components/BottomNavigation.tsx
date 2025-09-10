import { Button } from "@/components/ui/button";
import { Home, FileText, Menu, QrCode } from "lucide-react";
import QRCodeScanner from "./QRCodeScanner";
import ScreenCaptureComponent from "./ScreenCaptureComponent";
import ReceiptViewer from "./ReceiptViewer";
import { useQRScanner } from "@/hooks/useQRScanner";
import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";

const BottomNavigation = () => {
  const { 
    isOpen, 
    showReceiptViewer,
    currentReceiptUrl,
    openScanner, 
    closeScanner, 
    closeReceiptViewer,
    handleScanSuccess 
  } = useQRScanner();
  const [showCaptureDialog, setShowCaptureDialog] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <>
      {/* Botões flutuantes fixos */}
      <div className="fixed bottom-0 left-0 right-0 z-50 pointer-events-none">
        <div className="flex justify-between items-end w-full max-w-screen-lg mx-auto p-4 safe-area-inset-bottom">
          {/* Botão Início - sempre presente no canto esquerdo */}
          <Button
            variant="default"
            size="lg"
            className="flex-col h-16 w-16 rounded-full bg-green-600 hover:bg-green-700 text-white shadow-lg pointer-events-auto"
            onClick={() => navigate('/')}
          >
            <Home className="w-6 h-6" />
          </Button>
          
          {/* Botão Escanear QR - apenas na página inicial */}
          {location.pathname === '/' && (
            <Button
              variant="default"
              size="lg"
              className="flex-col h-20 w-20 rounded-full bg-green-600 hover:bg-green-700 text-white shadow-lg pointer-events-auto"
              onClick={openScanner}
            >
              <QrCode className="w-8 h-8" />
            </Button>
          )}
          
          {/* Botão Menu - sempre presente no canto direito */}
          <Button
            variant="default"
            size="lg"
            className="flex-col h-16 w-16 rounded-full bg-green-600 hover:bg-green-700 text-white shadow-lg pointer-events-auto"
            onClick={() => navigate('/menu')}
          >
            <Menu className="w-6 h-6" />
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
      
      {/* QR Code Scanner ativo */}
      <QRCodeScanner
        isOpen={isOpen}
        onClose={closeScanner}
        onScanSuccess={handleScanSuccess}
      />

      {/* Receipt Viewer */}
      {showReceiptViewer && currentReceiptUrl && (
        <ReceiptViewer
          url={currentReceiptUrl}
          isOpen={showReceiptViewer}
          onClose={closeReceiptViewer}
          onConfirm={closeReceiptViewer}
        />
      )}
    </>
  );
};

export default BottomNavigation;