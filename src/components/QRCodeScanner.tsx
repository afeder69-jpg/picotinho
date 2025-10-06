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

  const startNativeScanner = async () => {
    try {
      console.log('🔵 Iniciando scanner nativo ML Kit (API moderna)...');
      setIsScanning(true);
      
      // ✅ API MODERNA: Adicionar listener ANTES de iniciar o scan
      const listener = await BarcodeScanner.addListener(
        'barcodeScanned',
        async (result) => {
          console.log('📦 Código detectado:', result);
          
          if (result.barcode?.rawValue) {
            const code = result.barcode.rawValue;
            console.log('✅ QR Code lido com sucesso:', code);
            
            // Parar scanner e remover listener
            await BarcodeScanner.stopScan();
            listener.remove();
            setIsScanning(false);
            
            // Processar resultado
            onScanSuccess(code);
          }
        }
      );

      // ✅ API MODERNA: Iniciar scanner otimizado para NFCe
      await BarcodeScanner.startScan({
        formats: [BarcodeFormat.QrCode], // QR_CODE específico para NFCe
      });
      
      console.log('📷 Câmera nativa ativa - detecção contínua para NFCe iniciada');
      
      // Timeout de 90 segundos (mais tempo para NFCe densos)
      setTimeout(async () => {
        if (isScanning) {
          console.log('⏱️ Timeout: 90s sem detecção');
          await BarcodeScanner.stopScan();
          listener.remove();
          setIsScanning(false);
          
          toast({
            title: "💡 Dica",
            description: "QR Code não detectado. Tente: 1) Limpar a câmera 2) Melhorar iluminação 3) Afastar/aproximar",
            duration: 6000,
          });
        }
      }, 90000);
      
    } catch (error) {
      console.error('❌ Erro ao iniciar scanner nativo:', error);
      setIsScanning(false);
      
      // Fallback para scanner web
      toast({
        title: "Scanner nativo falhou",
        description: "Tentando com scanner web...",
      });
      setUseNativeScanner(false);
      setIsScanning(true);
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
                <div className="flex flex-col items-center justify-center py-12 space-y-6 bg-transparent">
                  {/* Overlay visual com guia */}
                  <div className="relative w-64 h-64 border-4 border-green-500 rounded-lg shadow-[0_0_20px_rgba(34,197,94,0.5)] animate-pulse">
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-56 h-56 border-2 border-green-400/50 rounded-md"></div>
                    </div>
                    {/* Cantos do quadro */}
                    <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-yellow-400"></div>
                    <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-yellow-400"></div>
                    <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-yellow-400"></div>
                    <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-yellow-400"></div>
                  </div>
                  
                  {/* Instruções visuais */}
                  <div className="space-y-3 text-center px-4 max-w-xs">
                    <p className="text-xl font-bold text-white drop-shadow-lg">
                      📱 Centralize o QR Code no quadro verde
                    </p>
                    <div className="space-y-1 text-sm text-white/90 bg-black/50 rounded-lg p-3">
                      <p>✓ Segure firme (evite tremores)</p>
                      <p>✓ Boa iluminação ajuda</p>
                      <p>✓ Distância: 10-15cm da tela</p>
                    </div>
                  </div>
                  
                  <Button 
                    variant="secondary" 
                    onClick={handleClose}
                    className="mt-2 bg-red-600 hover:bg-red-700 text-white"
                  >
                    Cancelar Scanner
                  </Button>
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
