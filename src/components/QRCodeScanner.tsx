import { useEffect, useState } from "react";
import { Scanner } from "@yudiel/react-qr-scanner";
import { X, Zap } from "lucide-react";
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
      // Tentar usar scanner nativo em dispositivos mobile
      if (isNative) {
        const permission = await BarcodeScanner.checkPermissions();
        
        if (permission.camera === 'granted') {
          setHasPermission(true);
          setUseNativeScanner(true);
          startNativeScanner();
        } else if (permission.camera === 'prompt' || permission.camera === 'prompt-with-rationale') {
          const requestResult = await BarcodeScanner.requestPermissions();
          if (requestResult.camera === 'granted') {
            setHasPermission(true);
            setUseNativeScanner(true);
            startNativeScanner();
          } else {
            setHasPermission(false);
            toast({
              title: "Permissão negada",
              description: "Permita o acesso à câmera nas configurações do app",
              variant: "destructive"
            });
          }
        } else {
          setHasPermission(false);
          toast({
            title: "Permissão negada",
            description: "Permita o acesso à câmera nas configurações do app",
            variant: "destructive"
          });
        }
      } else {
        // Web: usar scanner react-qr-scanner (não precisa checar permissão manualmente)
        setHasPermission(true);
        setUseNativeScanner(false);
        setIsScanning(true);
      }
    } catch (error) {
      console.error('Erro ao verificar permissões:', error);
      setHasPermission(false);
      toast({
        title: "Erro",
        description: "Erro ao acessar a câmera",
        variant: "destructive"
      });
    }
  };

  const scanWithStaticImage = async (): Promise<boolean> => {
    try {
      console.log('📸 Iniciando captura de imagem estática de alta resolução...');
      
      // Importar dinamicamente o plugin de câmera
      const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
      
      // Capturar foto em MÁXIMA RESOLUÇÃO (crítico para QR codes densos)
      const photo = await Camera.getPhoto({
        quality: 100, // Máxima qualidade
        allowEditing: false,
        resultType: CameraResultType.Uri,
        source: CameraSource.Camera,
        width: 4000, // Alta resolução (ajustado pela câmera)
        height: 4000,
        saveToGallery: false,
      });

      if (!photo.path) {
        console.log('❌ Foto não capturada');
        return false;
      }

      console.log('📷 Foto capturada, processando com ML Kit...');
      
      // Processar imagem de alta resolução com ML Kit
      const { barcodes } = await BarcodeScanner.readBarcodesFromImage({
        path: photo.path,
        formats: [BarcodeFormat.QrCode],
      });

      if (barcodes && barcodes.length > 0) {
        const code = barcodes[0].rawValue;
        console.log('✅ QR Code detectado na foto:', code);
        onScanSuccess(code || '');
        return true;
      }
      
      console.log('⚠️ Nenhum QR Code detectado na foto');
      toast({
        title: "QR Code não detectado",
        description: "Tente tirar outra foto mais próxima e com boa iluminação",
        variant: "destructive"
      });
      return false;
    } catch (error) {
      console.log('❌ Erro ao processar imagem estática:', error);
      return false;
    }
  };

  const tryGoogleCodeScanner = async (): Promise<boolean> => {
    try {
      console.log('🔍 Verificando Google Code Scanner...');
      
      const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
      console.log('✅ Google Code Scanner disponível:', available);
      
      if (!available) {
        console.log('📥 Instalando módulo Google Code Scanner...');
        await BarcodeScanner.installGoogleBarcodeScannerModule();
      }

      console.log('🚀 Iniciando Google Code Scanner...');
      const { barcodes } = await BarcodeScanner.scan({
        formats: [BarcodeFormat.QrCode],
      });

      if (barcodes && barcodes.length > 0) {
        const code = barcodes[0].rawValue;
        console.log('✅ Google Scanner detectou NFCe:', code);
        onScanSuccess(code || '');
        return true;
      }
      
      console.log('⚠️ Google Scanner não detectou código');
      return false;
    } catch (error) {
      console.log('❌ Google Code Scanner falhou:', error);
      return false;
    }
  };

  const startNativeScanner = async () => {
    try {
      console.log('🚀 Iniciando scanner otimizado para NFCe...');
      setIsScanning(true);
      
      // ESTRATÉGIA PRINCIPAL: Foto de alta resolução (MELHOR para QR codes densos em papel térmico)
      console.log('📸 Usando modo FOTO DE ALTA RESOLUÇÃO (ideal para NFCe)...');
      
      toast({
        title: "📸 Modo Foto Ativado",
        description: "Tire uma foto nítida do QR Code da NFCe",
        duration: 3000,
      });

      // Aguardar 1 segundo para usuário preparar
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const photoSuccess = await scanWithStaticImage();
      
      if (photoSuccess) {
        setIsScanning(false);
        return;
      }

      // Se foto falhou, oferecer tentar novamente
      toast({
        title: "Tentar novamente?",
        description: "Clique em 'Tirar Foto' para tentar outra vez",
        duration: 5000,
      });
      
      setIsScanning(false);
      
    } catch (error) {
      console.error('❌ Erro no scanner:', error);
      setIsScanning(false);
      
      toast({
        title: "Erro ao processar QR Code",
        description: "Tente novamente com melhor iluminação",
        variant: "destructive"
      });
    }
  };

  const stopScanner = async () => {
    if (useNativeScanner && isScanning) {
      try {
        await BarcodeScanner.stopScan();
        console.log('🛑 Scanner nativo parado');
      } catch (error) {
        console.error('Erro ao parar scanner:', error);
      }
    }
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
    
    // Se for erro de permissão e estivermos em mobile, tentar scanner nativo
    if (isNative && error?.name === 'NotAllowedError') {
      console.log('🔄 Tentando fallback para scanner nativo...');
      toast({
        title: "Tentando scanner nativo...",
        description: "Permissão da câmera web negada",
      });
      setUseNativeScanner(true);
      startNativeScanner();
    } else {
      toast({
        title: "Erro no scanner",
        description: "Verifique as permissões da câmera",
        variant: "destructive"
      });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4">
      <div className="bg-background rounded-lg w-full max-w-md relative overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between bg-gradient-to-r from-primary/10 to-primary/5">
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Scanner NFCe Otimizado</h2>
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
              <p>Iniciando câmera...</p>
            </div>
          ) : (
            <>
              {useNativeScanner ? (
                <div className="flex flex-col items-center justify-center py-12 space-y-6 bg-gradient-to-b from-primary/20 to-background">
                  {/* Ícone de câmera */}
                  <div className="relative w-32 h-32">
                    <div className="absolute inset-0 bg-primary/20 rounded-full animate-pulse"></div>
                    <div className="absolute inset-4 bg-primary/40 rounded-full flex items-center justify-center">
                      <Zap className="w-16 h-16 text-primary" />
                    </div>
                  </div>
                  
                  {/* Instruções */}
                  <div className="space-y-4 text-center px-6 max-w-sm">
                    <p className="text-2xl font-bold text-primary">
                      📸 Tire uma Foto do QR Code
                    </p>
                    
                    <div className="bg-card rounded-xl p-4 space-y-2.5 border-2 border-primary/30">
                      <p className="text-foreground font-semibold flex items-center gap-2 justify-center text-sm">
                        <span className="text-primary text-lg">✓</span>
                        Posicione a 10-15cm do cupom
                      </p>
                      <p className="text-foreground font-semibold flex items-center gap-2 justify-center text-sm">
                        <span className="text-primary text-lg">✓</span>
                        Use iluminação forte e uniforme
                      </p>
                      <p className="text-foreground font-semibold flex items-center gap-2 justify-center text-sm">
                        <span className="text-primary text-lg">✓</span>
                        Mantenha o QR Code plano e limpo
                      </p>
                      <p className="text-foreground font-semibold flex items-center gap-2 justify-center text-sm">
                        <span className="text-primary text-lg">✓</span>
                        Centralize o QR Code na foto
                      </p>
                    </div>
                    
                    <p className="text-muted-foreground text-xs bg-primary/10 rounded-lg px-3 py-2 border border-primary/20">
                      💡 Modo foto de alta resolução detecta QR codes densos de NFCe
                    </p>
                  </div>
                  
                  <div className="flex gap-3 mt-4">
                    <Button 
                      onClick={startNativeScanner}
                      className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold px-6 py-3 rounded-lg shadow-lg"
                    >
                      📸 Tirar Foto
                    </Button>
                    <Button 
                      variant="secondary" 
                      onClick={handleClose}
                      className="font-bold px-6 py-3 rounded-lg"
                    >
                      ✕ Cancelar
                    </Button>
                  </div>
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
