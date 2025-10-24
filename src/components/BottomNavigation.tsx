import { Button } from "@/components/ui/button";
import { Home, Menu, QrCode } from "lucide-react";
import ScreenCaptureComponent from "./ScreenCaptureComponent";
import QRCodeScannerWeb from "./QRCodeScannerWeb";
import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { InAppBrowser } from "@awesome-cordova-plugins/in-app-browser";

const BottomNavigation = () => {
  const [showCaptureDialog, setShowCaptureDialog] = useState(false);
  const [showQRScanner, setShowQRScanner] = useState(false);
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

  const handleNativeFlow = async (data: string) => {
    try {
      console.log('🌐 [NATIVO] Abrindo InAppBrowser...');
      
      const browser = InAppBrowser.create(data, '_blank', {
        location: 'yes',
        clearcache: 'yes',
        clearsessioncache: 'yes',
        zoom: 'no',
        hardwareback: 'yes',
        closebuttoncaption: 'Fechar',
        toolbar: 'yes',
        presentationstyle: 'fullscreen',
        fullscreen: 'yes',
      });
      
      let htmlCapturado: string | null = null;
      
      browser.on('loadstop').subscribe(() => {
        console.log('📄 [NATIVO] Página carregada! Capturando HTML...');
        
        browser.executeScript({
          code: 'document.documentElement.outerHTML'
        }).then((result: any) => {
          if (result && result.length > 0) {
            htmlCapturado = result[0];
            console.log(`✅ [NATIVO] HTML capturado: ${htmlCapturado.length} caracteres`);
          }
        }).catch((error: any) => {
          console.error('❌ [NATIVO] Erro ao capturar HTML:', error);
        });
      });
      
      browser.on('exit').subscribe(async () => {
        console.log('🔙 [NATIVO] Browser fechado pelo usuário');
        
        if (!htmlCapturado) {
          toast({
            title: "Erro",
            description: "HTML não foi capturado. Tente novamente.",
            variant: "destructive"
          });
          return;
        }
        
        navigate('/screenshots');
        
        toast({
          title: "Processando nota",
          description: "A nota está sendo extraída...",
        });
        
        try {
          const { data: processData, error } = await supabase.functions.invoke('process-html-capturado', {
            body: {
              html: htmlCapturado,
              userId: currentUserId,
              url: data
            }
          });
          
          if (error) throw error;
          
          console.log('✅ [NATIVO] Nota processada com sucesso:', processData);
          
          toast({
            title: "✅ Nota salva!",
            description: "Nota fiscal capturada e salva com sucesso.",
          });
          
        } catch (error) {
          console.error('❌ [NATIVO] Erro ao processar nota:', error);
          toast({
            title: "Erro ao processar",
            description: "Não foi possível processar a nota fiscal",
            variant: "destructive"
          });
        }
      });
      
    } catch (error) {
      console.error('❌ [NATIVO] Erro ao abrir browser:', error);
      toast({
        title: "Erro ao abrir nota",
        description: "Não foi possível visualizar a nota fiscal",
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
      handleNativeFlow(data);
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
    </>
  );
};

export default BottomNavigation;