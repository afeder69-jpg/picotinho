import { Button } from "@/components/ui/button";
import { Home, Menu, QrCode } from "lucide-react";
import ScreenCaptureComponent from "./ScreenCaptureComponent";
import QRCodeScannerWeb from "./QRCodeScannerWeb";
import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const BottomNavigation = () => {
  const [showCaptureDialog, setShowCaptureDialog] = useState(false);
  const [showQRScanner, setShowQRScanner] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const handleQRScanSuccess = async (data: string) => {
    console.log("QR Code escaneado:", data);
    
    // Validar se é uma URL de nota fiscal válida
    const urlPattern = /^https?:\/\/.+/i;
    
    if (!urlPattern.test(data)) {
      toast({
        title: "QR Code inválido",
        description: "Este não parece ser um QR Code de nota fiscal válido.",
        variant: "destructive",
      });
      setShowQRScanner(false);
      return;
    }
    
    setShowQRScanner(false);
    
    toast({
      title: "Processando nota fiscal",
      description: "Capturando e extraindo dados da nota...",
    });
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        toast({
          title: "Erro de autenticação",
          description: "Você precisa estar logado para processar notas.",
          variant: "destructive",
        });
        return;
      }
      
      // Enviar para processamento via edge function
      const { data: result, error } = await supabase.functions.invoke('capture-receipt-external', {
        body: {
          receiptUrl: data,
          userId: user.id
        }
      });
      
      if (error) {
        console.error("Erro ao processar nota:", error);
        toast({
          title: "Erro ao processar nota",
          description: "Não foi possível processar a nota fiscal. Tente novamente.",
          variant: "destructive",
        });
        return;
      }
      
      toast({
        title: "✅ Nota capturada!",
        description: "Revise os dados antes de processar.",
      });
      
      // Navegar para a página de notas fiscais com destaque
      navigate(`/screenshots?highlight=${result.notaImagemId}`);
      
    } catch (error) {
      console.error("Erro ao processar QR Code:", error);
      toast({
        title: "Erro no processamento",
        description: "Ocorreu um erro ao processar o QR Code.",
        variant: "destructive",
      });
    }
  };

  const handleQRButtonClick = () => {
    setShowQRScanner(true);
  };

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
          
          {/* Botão Escanear QR - Funcional em todas as plataformas */}
          {location.pathname === '/' && (
            <Button
              variant="default"
              size="lg"
              className="flex-col h-20 w-20 rounded-full bg-green-600 hover:bg-green-700 text-white shadow-lg pointer-events-auto"
              onClick={handleQRButtonClick}
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

      {/* QR Code Scanner */}
      {showQRScanner && (
        <QRCodeScannerWeb
          onScanSuccess={handleQRScanSuccess}
          onClose={() => setShowQRScanner(false)}
        />
      )}
    </>
  );
};

export default BottomNavigation;