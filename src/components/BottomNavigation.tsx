import { Button } from "@/components/ui/button";
import { Home, Menu, QrCode } from "lucide-react";
import ScreenCaptureComponent from "./ScreenCaptureComponent";
import QRCodeScannerWeb from "./QRCodeScannerWeb";
import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { App } from "@capacitor/app";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const BottomNavigation = () => {
  const [showCaptureDialog, setShowCaptureDialog] = useState(false);
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [showConfirmOpenDialog, setShowConfirmOpenDialog] = useState(false);
  const [pendingQrUrl, setPendingQrUrl] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUserId(user?.id || null);
    };
    fetchUser();
  }, []);

  // Listener para quando o usuário volta do navegador (visibilitychange)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('👀 [VISIBILITY] App ficou visível novamente');
        
        const pendingUrl = localStorage.getItem('pending_nota_url');
        const timestamp = localStorage.getItem('pending_nota_timestamp');
        
        if (pendingUrl && timestamp) {
          // Verificar se não passou muito tempo (5 minutos)
          const elapsed = Date.now() - parseInt(timestamp);
          const FIVE_MINUTES = 5 * 60 * 1000;
          
          if (elapsed < FIVE_MINUTES) {
            console.log('✅ [VISIBILITY] URL pendente válida, processando automaticamente');
            
            // Limpar localStorage ANTES de processar
            localStorage.removeItem('pending_nota_url');
            localStorage.removeItem('pending_nota_timestamp');
            
            // Processar automaticamente
            processNotaUrl(pendingUrl);
          } else {
            console.log('⏰ [VISIBILITY] URL pendente expirada (>5min), ignorando');
            localStorage.removeItem('pending_nota_url');
            localStorage.removeItem('pending_nota_timestamp');
          }
        }
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [currentUserId]);

  const processNotaUrl = async (url: string) => {
    if (!currentUserId) {
      toast({
        title: "Erro",
        description: "Usuário não identificado",
        variant: "destructive"
      });
      return;
    }
    
    console.log('🔄 [PROCESSAR] Processando nota automaticamente:', url);
    
    navigate('/screenshots');
    
    toast({
      title: "🔄 Processando nota",
      description: "Aguarde enquanto extraímos os dados...",
    });
    
    try {
      const { data, error } = await supabase.functions.invoke('process-url-nota', {
        body: { url, userId: currentUserId }
      });
      
      if (error) throw error;
      
      console.log('✅ [PROCESSAR] Sucesso:', data);
      
      toast({
        title: "✅ Nota processada!",
        description: "A nota fiscal foi capturada com sucesso",
      });
      
    } catch (error) {
      console.error('❌ [PROCESSAR] Erro:', error);
      toast({
        title: "Erro ao processar",
        description: "Não foi possível processar a nota. Tente novamente.",
        variant: "destructive"
      });
    }
  };

  const handleConfirmOpen = async () => {
    if (!pendingQrUrl) return;
    
    setShowConfirmOpenDialog(false);
    
    try {
      console.log('🌐 [NATIVO] Abrindo nota no navegador padrão...');
      
      // Salvar URL e timestamp no localStorage
      localStorage.setItem('pending_nota_url', pendingQrUrl);
      localStorage.setItem('pending_nota_timestamp', Date.now().toString());
      console.log('💾 [NATIVO] URL salva no localStorage');
      
      // Abrir no navegador nativo do Android
      await Browser.open({ url: pendingQrUrl });
      
      // Limpar estado
      setPendingQrUrl(null);
      
      toast({
        title: "📄 Nota fiscal aberta",
        description: "Quando terminar de visualizar, pressione 'Voltar' que processaremos automaticamente",
        duration: 6000,
      });
      
    } catch (error) {
      console.error('❌ [NATIVO] Erro ao abrir navegador:', error);
      toast({
        title: "Erro ao abrir nota",
        description: "Não foi possível abrir o navegador",
        variant: "destructive"
      });
    }
  };

  const handleWebFlow = async (url: string) => {
    console.log('🌐 [WEB] Modo navegador detectado - funcionalidade limitada');
    
    toast({
      title: "⚠️ Modo de Teste (Web)",
      description: "O InAppBrowser só funciona completamente no APK Android. Abrindo nota em nova aba para visualização...",
      duration: 6000,
    });
    
    window.open(url, '_blank');
    
    setTimeout(() => {
      console.log('🔄 [WEB] Simulando retorno do navegador...');
      navigate('/screenshots');
      
      toast({
        title: "💡 Teste em modo web",
        description: "Para captura automática de notas, compile e teste no APK Android. No navegador, este fluxo é apenas demonstrativo.",
        duration: 8000,
      });
    }, 4000);
  };

  const handleQRScanSuccess = async (data: string) => {
    console.log("QR Code escaneado:", data);
    
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
    
    const isNative = Capacitor.isNativePlatform();
    console.log(`🔍 Plataforma detectada: ${isNative ? 'NATIVA (Android/iOS)' : 'WEB (navegador)'}`);
    
    if (isNative) {
      // Salvar URL e mostrar dialog ANTES de abrir
      setPendingQrUrl(data);
      setShowConfirmOpenDialog(true);
    } else {
      handleWebFlow(data);
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

      {/* QR Code Scanner */}
      {showQRScanner && (
        <QRCodeScannerWeb
          onScanSuccess={handleQRScanSuccess}
          onClose={() => setShowQRScanner(false)}
        />
      )}

      {/* Dialog de Confirmação ANTES de abrir o navegador */}
      <AlertDialog open={showConfirmOpenDialog} onOpenChange={setShowConfirmOpenDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>🔍 Abrir nota e processar?</AlertDialogTitle>
            <AlertDialogDescription>
              Vamos abrir a nota fiscal no navegador para você visualizar. 
              Quando você voltar para o app, processaremos automaticamente!
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setShowConfirmOpenDialog(false);
              setPendingQrUrl(null);
            }}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmOpen}>
              Sim, abrir e processar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default BottomNavigation;