import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Home, Menu, QrCode } from "lucide-react";
import ScreenCaptureComponent from "./ScreenCaptureComponent";
import QRCodeScanner from "./QRCodeScanner";
import QRCodeScannerWeb from "./QRCodeScannerWeb";
import InternalWebViewer from "./InternalWebViewer";
import { SimplifiedInAppBrowser } from "./SimplifiedInAppBrowser";
import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/components/auth/AuthProvider";
import { detectarTipoDocumento, TipoDocumento, extrairChaveNFe } from "@/lib/documentDetection";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";

const BottomNavigation = () => {
  const [showCaptureDialog, setShowCaptureDialog] = useState(false);
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [showSimplifiedBrowser, setShowSimplifiedBrowser] = useState(false);
  const [showInternalWebViewer, setShowInternalWebViewer] = useState(false);
  const [pendingQrUrl, setPendingQrUrl] = useState<string | null>(null);
  const [pendingDocType, setPendingDocType] = useState<TipoDocumento>(null);
  const [pendingNotaData, setPendingNotaData] = useState<any>(null);
  const [isProcessingQRCode, setIsProcessingQRCode] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const handleNoteConfirm = async () => {
    console.log('✅ [INTERNAL VIEWER] Nota confirmada, navegando para screenshots');
    setShowInternalWebViewer(false);
    setPendingQrUrl(null);
    navigate('/screenshots');
  };

  const handleNoteClose = () => {
    console.log('❌ [VIEWER] Viewer fechado');
    setShowInternalWebViewer(false);
    setShowSimplifiedBrowser(false);
    setPendingQrUrl(null);
    setPendingDocType(null);
  };


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
    console.log(`🔍 Tipo de documento: ${tipoDocumento || 'DESCONHECIDO'}`);
    
    setShowQRScanner(false);
    
    // Verificar se é plataforma nativa (Android/iOS)
    if (Capacitor.isNativePlatform()) {
      // NOVO FLUXO: Processar ANTES de abrir o visualizador
      console.log('📱 [NATIVO] Processando nota via InfoSimples...');
      setIsProcessingQRCode(true);
      
      try {
        const chaveAcesso = extrairChaveNFe(data);
        
        if (!chaveAcesso) {
          throw new Error('Não foi possível extrair a chave de acesso da URL');
        }
        
        console.log('🔑 Chave extraída:', chaveAcesso);
        
        // Chamar process-url-nota IMEDIATAMENTE
        const { data: processData, error: processError } = await supabase.functions.invoke('process-url-nota', {
          body: {
            url: data,
            userId: user.id,
            chaveAcesso,
            tipoDocumento,
          },
        });
        
        if (processError) throw processError;
        
        console.log('✅ Processamento iniciado:', processData);
        
        // Aguardar alguns segundos para o InfoSimples processar
        await new Promise(resolve => setTimeout(resolve, 8000));
        
        // Buscar os dados processados
        const { data: notaData, error: notaError } = await supabase
          .from('notas_imagens')
          .select('id, dados_extraidos, nome_original')
          .eq('id', processData.notaId)
          .single();
        
        if (notaError) throw notaError;
        
        console.log('📄 Dados da nota buscados:', notaData);
        
        if (!notaData.dados_extraidos) {
          throw new Error('Nota ainda está sendo processada. Tente novamente em alguns segundos.');
        }
        
        // Abrir SimplifiedInAppBrowser com os DADOS
        setPendingQrUrl(data);
        setPendingDocType(tipoDocumento);
        setPendingNotaData(notaData);
        setShowSimplifiedBrowser(true);
        setIsProcessingQRCode(false);
        
        toast({
          title: "✅ Nota carregada",
          description: "Confira os dados e confirme",
        });
        
      } catch (error: any) {
        console.error('❌ Erro ao processar nota:', error);
        setIsProcessingQRCode(false);
        
        toast({
          title: "Erro ao processar nota",
          description: error.message || "Tente novamente",
          variant: "destructive",
        });
      }
    } else {
      // Em plataforma web: usar InternalWebViewer (NFe/Serpro)
      setPendingQrUrl(data);
      setPendingDocType(tipoDocumento);
      
      if (tipoDocumento === 'NFe') {
        console.log('📄 [WEB/NFE] Abrindo InternalWebViewer (Serpro)...');
        setShowInternalWebViewer(true);
        toast({
          title: "📄 Nota Fiscal Eletrônica",
          description: "A nota será processada via API Serpro",
        });
      } else {
        // NFCe na web: mostrar aviso
        toast({
          title: "⚠️ NFCe detectada",
          description: "Use o app Android/iOS para processar NFCe",
          variant: "destructive",
        });
      }
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

      {/* Fallback: Se não estiver autenticado, mostrar modal de login */}
      {showInternalWebViewer && pendingQrUrl && !user?.id && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="max-w-md">
            <CardHeader>
              <CardTitle>Login Necessário</CardTitle>
            </CardHeader>
            <CardContent>
              <p>Você precisa estar logado para processar notas fiscais.</p>
              <Button onClick={() => navigate('/auth')} className="mt-4 w-full">
                Fazer Login
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Loading Dialog - Processando QR Code */}
      <Dialog open={isProcessingQRCode}>
        <DialogContent className="max-w-sm">
          <div className="text-center py-8">
            <Loader2 className="w-16 h-16 animate-spin text-primary mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Processando nota fiscal...</h3>
            <p className="text-sm text-muted-foreground">Aguarde enquanto buscamos os dados da nota</p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Simplified In-App Browser (Nativo - NFe/NFCe) */}
      {showSimplifiedBrowser && pendingNotaData && user?.id && (
        <SimplifiedInAppBrowser
          notaId={pendingNotaData.id}
          dadosExtraidos={pendingNotaData.dados_extraidos}
          userId={user.id}
          tipoDocumento={pendingDocType}
          isOpen={showSimplifiedBrowser}
          onClose={handleNoteClose}
          onConfirm={handleNoteConfirm}
        />
      )}

      {/* Internal Web Viewer com API Serpro (NFe - Web only) */}
      {showInternalWebViewer && pendingQrUrl && user?.id && (
        <InternalWebViewer
          url={pendingQrUrl}
          isOpen={showInternalWebViewer}
          onClose={handleNoteClose}
          onConfirm={handleNoteConfirm}
          userId={user.id}
        />
      )}
    </>
  );
};

export default BottomNavigation;