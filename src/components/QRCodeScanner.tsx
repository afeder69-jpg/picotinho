import { useEffect, useState } from "react";
import { Scanner } from "@yudiel/react-qr-scanner";
import { X, Camera as CameraIcon } from "lucide-react";
import { Button } from "./ui/button";
import { BarcodeScanner, BarcodeFormat } from '@capacitor-mlkit/barcode-scanning';
import { Capacitor } from '@capacitor/core';
import { toast } from "@/hooks/use-toast";

interface QRCodeScannerProps {
  onScanSuccess: (result: string) => void;
  onClose: () => void;
  isOpen: boolean;
}

const QRCodeScanner = ({ onScanSuccess, onClose, isOpen }: QRCodeScannerProps) => {
  const [isScanning, setIsScanning] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [useNativeScanner, setUseNativeScanner] = useState(false);
  const isNative = Capacitor.isNativePlatform();

  useEffect(() => {
    if (isOpen) {
      checkPermissionAndStart();
    } else {
      stopScanner();
    }

    return () => {
      stopScanner();
    };
  }, [isOpen]);

  const checkPermissionAndStart = async () => {
    try {
      if (isNative) {
        // Android/iOS: Verificar permissões da câmera
        console.log('📱 Plataforma nativa detectada, verificando permissões...');
        const permission = await BarcodeScanner.checkPermissions();
        
        if (permission.camera === 'granted') {
          setHasPermission(true);
          setUseNativeScanner(true);
          setIsScanning(true);
          console.log('✅ Permissão da câmera concedida, pronto para tirar foto');
        } else if (permission.camera === 'prompt' || permission.camera === 'prompt-with-rationale') {
          console.log('🔔 Solicitando permissão da câmera...');
          const requestResult = await BarcodeScanner.requestPermissions();
          if (requestResult.camera === 'granted') {
            setHasPermission(true);
            setUseNativeScanner(true);
            setIsScanning(true);
            console.log('✅ Permissão da câmera concedida após solicitação');
          } else {
            setHasPermission(false);
            console.log('❌ Permissão da câmera negada pelo usuário');
            toast({
              title: "Permissão negada",
              description: "Permita o acesso à câmera nas configurações do app",
              variant: "destructive"
            });
          }
        } else {
          setHasPermission(false);
          console.log('❌ Permissão da câmera negada');
          toast({
            title: "Permissão negada",
            description: "Permita o acesso à câmera nas configurações do app",
            variant: "destructive"
          });
        }
      } else {
        // Web: usar scanner react-qr-scanner
        console.log('🌐 Plataforma web detectada, usando react-qr-scanner');
        setHasPermission(true);
        setUseNativeScanner(false);
        setIsScanning(true);
      }
    } catch (error) {
      console.error('❌ Erro ao verificar permissões:', error);
      setHasPermission(false);
      toast({
        title: "Erro",
        description: "Erro ao acessar a câmera",
        variant: "destructive"
      });
    }
  };

  const isValidNFCeUrl = (url: string): boolean => {
    try {
      const urlObj = new URL(url);
      const hasNFeParams = urlObj.searchParams.has('chNFe') || 
                           urlObj.searchParams.has('p') || 
                           urlObj.searchParams.has('tpAmb');
      const isSefazDomain = urlObj.hostname.includes('sefaz') || 
                            urlObj.hostname.includes('fazenda');
      
      console.log('🔍 Validando NFCe:', { url, hasNFeParams, isSefazDomain });
      return hasNFeParams && isSefazDomain;
    } catch {
      return false;
    }
  };

  const scanWithStaticImage = async (): Promise<boolean> => {
    try {
      console.log('📸 Abrindo câmera para capturar QR Code em alta resolução...');
      
      toast({
        title: "📸 Abrindo câmera...",
        description: "Tire uma foto do QR Code",
        duration: 2000,
      });

      const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
      
      const photo = await Camera.getPhoto({
        quality: 100,
        allowEditing: false,
        resultType: CameraResultType.Uri,
        source: CameraSource.Camera,
        width: 4000,
        height: 4000,
        saveToGallery: false,
      });

      if (!photo.path) {
        console.log('❌ Foto não capturada (usuário cancelou)');
        return false;
      }

      console.log('📷 Foto capturada, processando com ML Kit...');
      
      toast({
        title: "⏳ Processando...",
        description: "Detectando QR Code na foto",
        duration: 2000,
      });

      const { barcodes } = await BarcodeScanner.readBarcodesFromImage({
        path: photo.path,
        formats: [BarcodeFormat.QrCode],
      });

      if (barcodes && barcodes.length > 0) {
        const code = barcodes[0].rawValue;
        console.log('✅ QR Code detectado na foto:', code);
        
        if (code && isValidNFCeUrl(code)) {
          console.log('✅ NFCe válida detectada!');
          toast({
            title: "✅ NFCe Detectada!",
            description: "Processando nota fiscal...",
            duration: 2000,
          });
          onScanSuccess(code);
          return true;
        } else {
          console.log('⚠️ QR Code detectado mas não é NFCe válida');
          toast({
            title: "⚠️ QR Code Inválido",
            description: "Este não parece ser um QR Code de NFCe",
            variant: "destructive",
            duration: 4000,
          });
        }
      } else {
        console.log('⚠️ Nenhum QR Code detectado na foto');
        toast({
          title: "❌ QR Code não detectado",
          description: "Tente novamente: aproxime-se e use boa iluminação",
          variant: "destructive",
          duration: 4000,
        });
      }
      
      return false;
    } catch (error) {
      console.log('❌ Erro ao processar imagem:', error);
      toast({
        title: "Erro",
        description: "Falha ao processar foto. Tente novamente.",
        variant: "destructive"
      });
      return false;
    }
  };

  const handleTakePhoto = async () => {
    const success = await scanWithStaticImage();
    
    if (success) {
      setIsScanning(false);
    }
    // Se falhar, mantém o modal aberto para tentar novamente
  };

  const stopScanner = () => {
    setIsScanning(false);
    setHasPermission(null);
    setUseNativeScanner(false);
  };

  const handleClose = () => {
    stopScanner();
    onClose();
  };

  const handleWebScan = (detectedCodes: any) => {
    if (detectedCodes && detectedCodes.length > 0) {
      const code = detectedCodes[0].rawValue;
      console.log('✅ QR Code lido com sucesso (web):', code);
      onScanSuccess(code);
    } else {
      console.log('⚠️ Scanner web ativo mas nenhum código detectado ainda');
    }
  };

  const handleWebError = (error: any) => {
    console.error('❌ Erro no scanner web:', error);
    
    toast({
      title: "Erro no scanner",
      description: "Verifique as permissões da câmera",
      variant: "destructive"
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4">
      <div className="bg-background rounded-lg w-full max-w-md relative overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between bg-gradient-to-r from-primary/10 to-primary/5">
          <div className="flex items-center gap-2">
            <CameraIcon className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Scanner QR Code NFCe</h2>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClose}
            className="h-8 w-8"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="relative">
          {hasPermission === false ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center space-y-4">
              <p className="text-muted-foreground">
                Permissão de câmera necessária para escanear QR Codes
              </p>
              <Button onClick={checkPermissionAndStart}>
                Tentar Novamente
              </Button>
            </div>
          ) : !isScanning ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <p>Verificando permissões...</p>
            </div>
          ) : (
            <>
              {useNativeScanner ? (
                <div className="flex flex-col items-center justify-center py-8 space-y-6 bg-gradient-to-b from-primary/10 to-background">
                  {/* Ícone da câmera */}
                  <div className="relative w-32 h-32">
                    <div className="absolute inset-0 bg-primary/20 rounded-full animate-pulse"></div>
                    <div className="absolute inset-4 bg-primary/30 rounded-full flex items-center justify-center">
                      <CameraIcon className="w-16 h-16 text-primary" />
                    </div>
                  </div>
                  
                  {/* Título */}
                  <div className="space-y-3 text-center px-6 max-w-sm">
                    <p className="text-xl font-bold text-primary">
                      📸 Tire uma Foto do QR Code
                    </p>
                    
                    <p className="text-sm text-muted-foreground">
                      QR codes de NFCe precisam de foto em alta resolução para leitura precisa
                    </p>
                    
                    {/* Dicas */}
                    <div className="bg-card rounded-xl p-4 space-y-2 border-2 border-primary/20 mt-4">
                      <p className="text-foreground text-sm flex items-center gap-2">
                        <span className="text-primary font-bold">✓</span>
                        <span>Distância: 10-15cm do cupom</span>
                      </p>
                      <p className="text-foreground text-sm flex items-center gap-2">
                        <span className="text-primary font-bold">✓</span>
                        <span>Iluminação forte e uniforme</span>
                      </p>
                      <p className="text-foreground text-sm flex items-center gap-2">
                        <span className="text-primary font-bold">✓</span>
                        <span>QR Code plano e centralizado</span>
                      </p>
                    </div>
                  </div>
                  
                  {/* Botões de ação */}
                  <div className="flex flex-col gap-3 mt-4 w-full px-6">
                    <Button 
                      onClick={handleTakePhoto}
                      size="lg"
                      className="w-full text-base font-bold"
                    >
                      📸 Tirar Foto e Escanear
                    </Button>
                    
                    <Button 
                      variant="outline" 
                      onClick={handleClose}
                      className="w-full"
                    >
                      Cancelar
                    </Button>
                  </div>
                  
                  <p className="text-muted-foreground text-xs bg-primary/5 rounded-lg px-3 py-2 border border-primary/10 mx-6">
                    💡 Scanner otimizado para NFCe em papel térmico
                  </p>
                </div>
              ) : (
                <div className="w-full aspect-square bg-black">
                  <Scanner
                    onScan={handleWebScan}
                    onError={handleWebError}
                    formats={['qr_code']}
                    components={{
                      torch: true,
                      finder: true,
                    }}
                    styles={{
                      container: { 
                        width: '100%',
                        height: '100%',
                      },
                    }}
                    scanDelay={300}
                  />
                  <div className="p-4 text-center text-sm text-muted-foreground bg-background/95">
                    💡 Posicione o QR Code dentro do quadro
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default QRCodeScanner;
