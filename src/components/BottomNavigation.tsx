import { Button } from "@/components/ui/button";
import { Home, Menu, QrCode } from "lucide-react";
import ScreenCaptureComponent from "./ScreenCaptureComponent";
import QRCodeScanner from "./QRCodeScanner";
import QRCodeScannerWeb from "./QRCodeScannerWeb";
import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/components/auth/AuthProvider";
import { detectarTipoDocumento, extrairChaveNFe } from "@/lib/documentDetection";
import { supabase } from "@/integrations/supabase/client";

const BottomNavigation = () => {
  const [showCaptureDialog, setShowCaptureDialog] = useState(false);
  const [showQRScanner, setShowQRScanner] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();


  const handleQRScanSuccess = async (data: string) => {
    console.log("QR Code escaneado:", data);
    
    // Validação de autenticação
    if (!user?.id) {
      console.error('❌ [AUTH] Usuário não identificado ao escanear QR');
      toast({
        title: "❌ Usuário não identificado",
        description: "Faça login para escanear notas fiscais",
        variant: "destructive",
      });
      setShowQRScanner(false);
      return;
    }
    
    console.log('👤 [AUTH] Usuário autenticado:', user.id);
    
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
    
    // Detectar tipo de documento (NFe vs NFCe)
    const tipoDocumento = detectarTipoDocumento(data);
    const chaveAcesso = extrairChaveNFe(data);
    
    if (!chaveAcesso) {
      toast({
        title: "Erro ao ler QR Code",
        description: "Não foi possível extrair a chave de acesso",
        variant: "destructive",
      });
      setShowQRScanner(false);
      return;
    }
    
    console.log(`🔍 Tipo: ${tipoDocumento || 'DESCONHECIDO'}, Chave: ${chaveAcesso}`);
    
    setShowQRScanner(false);
    
    try {
      // ✅ Iniciar processamento em background (NÃO aguardar conclusão)
      const { data: processData, error: processError } = await supabase.functions.invoke('process-url-nota', {
        body: {
          url: data,
          userId: user.id,
          chaveAcesso,
          tipoDocumento,
        },
      });
      
      if (processError) throw processError;
      
      // ✅ LIBERAR USUÁRIO IMEDIATAMENTE
      toast({
        title: "📝 Nota em processamento",
        description: "Continue usando o app. Você será notificado quando estiver pronta!",
        duration: 5000,
      });
      
      console.log('✅ Processamento iniciado em background:', processData.notaId);
      
      // ← Usuário livre para navegar, não aguardamos mais nada
      
    } catch (error: any) {
      console.error('❌ Erro ao iniciar processamento:', error);
      toast({
        title: "Erro ao processar nota",
        description: error.message || "Tente novamente",
        variant: "destructive",
      });
    }
  };

  const handleQRButtonClick = () => {
    console.log('🔘 Botão QR Code clicado');
    console.log('📱 Plataforma:', Capacitor.getPlatform());
    console.log('🏠 Nativo?', Capacitor.isNativePlatform());
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

      {/* QR Code Scanner - Nativo ou Web dependendo da plataforma */}
      {showQRScanner && (
        Capacitor.isNativePlatform() ? (
          <QRCodeScanner
            onScanSuccess={handleQRScanSuccess}
            onClose={() => setShowQRScanner(false)}
          />
        ) : (
          <QRCodeScannerWeb
            onScanSuccess={handleQRScanSuccess}
            onClose={() => setShowQRScanner(false)}
          />
        )
      )}

    </>
  );
};

export default BottomNavigation;