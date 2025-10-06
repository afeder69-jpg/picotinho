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

  const tryGoogleCodeScanner = async (): Promise<boolean> => {
    try {
      console.log('🔍 Verificando Google Code Scanner...');
      
      // Verificar se módulo Google está disponível
      const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
      console.log('✅ Google Code Scanner disponível:', available);
      
      if (!available) {
        console.log('📥 Instalando módulo Google Code Scanner...');
        await BarcodeScanner.installGoogleBarcodeScannerModule();
      }

      // Usar API scan() do Google (otimizada para NFCe)
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
      console.log('❌ Google Code Scanner falhou, tentando ML Kit manual:', error);
      return false;
    }
  };

  const startNativeScanner = async () => {
    try {
      console.log('🚀 Iniciando scanner otimizado para NFCe...');
      setIsScanning(true);
      
      // ESTRATÉGIA 1: Tentar Google Code Scanner (melhor para papel térmico)
      const googleSuccess = await tryGoogleCodeScanner();
      if (googleSuccess) {
        setIsScanning(false);
        return;
      }

      // ESTRATÉGIA 2: ML Kit manual com configurações otimizadas
      console.log('📱 Usando ML Kit com foco em QR densos...');
      
      const listener = await BarcodeScanner.addListener(
        'barcodeScanned',
        async (result) => {
          console.log('📦 ML Kit detectou:', result);
          
          if (result.barcode?.rawValue) {
            const code = result.barcode.rawValue;
            console.log('✅ NFCe lida com sucesso:', code);
            
            await BarcodeScanner.stopScan();
            listener.remove();
            setIsScanning(false);
            onScanSuccess(code);
          }
        }
      );

      // Configuração otimizada para NFCe em papel térmico
      await BarcodeScanner.startScan({
        formats: [BarcodeFormat.QrCode],
      });
      
      console.log('📷 ML Kit ativo com foco otimizado');
      
      // Timeout reduzido (30s) para sugerir fallback mais rápido
      setTimeout(async () => {
        if (isScanning) {
          console.log('⏱️ Timeout ML Kit - QR não detectado');
          await BarcodeScanner.stopScan();
          listener.remove();
          setIsScanning(false);
          
          toast({
            title: "💡 Dificuldade para ler NFCe?",
            description: "Dicas: • Segurar a 10-15cm • Iluminação forte • QR limpo e plano • Sem dobras",
            duration: 7000,
          });
        }
      }, 30000);
      
    } catch (error) {
      console.error('❌ Erro total no scanner nativo:', error);
      setIsScanning(false);
      
      toast({
        title: "Scanner nativo falhou",
        description: "Tentando scanner alternativo...",
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
                <div className="flex flex-col items-center justify-center py-12 space-y-6 bg-gradient-to-b from-black/95 to-black/80">
                  {/* Quadro otimizado com animação */}
                  <div className="relative w-72 h-72">
                    {/* Quadro externo animado */}
                    <div className="absolute inset-0 border-4 border-green-500/70 rounded-3xl shadow-[0_0_30px_rgba(34,197,94,0.6)] animate-pulse"></div>
                    
                    {/* Quadro interno */}
                    <div className="absolute inset-3 border-2 border-green-400/40 rounded-2xl"></div>
                    
                    {/* Cantos destacados - amarelo/verde */}
                    <div className="absolute -top-1 -left-1 w-14 h-14 border-t-[5px] border-l-[5px] border-yellow-400 rounded-tl-3xl shadow-lg"></div>
                    <div className="absolute -top-1 -right-1 w-14 h-14 border-t-[5px] border-r-[5px] border-yellow-400 rounded-tr-3xl shadow-lg"></div>
                    <div className="absolute -bottom-1 -left-1 w-14 h-14 border-b-[5px] border-l-[5px] border-yellow-400 rounded-bl-3xl shadow-lg"></div>
                    <div className="absolute -bottom-1 -right-1 w-14 h-14 border-b-[5px] border-r-[5px] border-yellow-400 rounded-br-3xl shadow-lg"></div>
                    
                    {/* Ícone QR Code no centro */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-20 h-20 bg-white/20 border-4 border-white/40 rounded-xl p-2 backdrop-blur-sm">
                        <div className="grid grid-cols-4 gap-1 h-full">
                          {[...Array(16)].map((_, i) => (
                            <div key={i} className={`rounded-sm ${i % 3 === 0 ? 'bg-white' : 'bg-white/60'}`}></div>
                          ))}
                        </div>
                      </div>
                    </div>
                    
                    {/* Linha de scan animada */}
                    <div className="absolute inset-x-0 top-1/2 h-1 bg-gradient-to-r from-transparent via-green-400 to-transparent animate-pulse"></div>
                  </div>
                  
                  {/* Instruções otimizadas para NFCe */}
                  <div className="space-y-4 text-center px-6 max-w-sm">
                    <p className="text-2xl font-bold text-green-400 drop-shadow-[0_2px_10px_rgba(34,197,94,0.8)] animate-pulse">
                      📱 Posicione o QR Code da NFCe
                    </p>
                    
                    <div className="bg-black/70 rounded-xl p-4 space-y-2.5 border border-green-500/30 shadow-xl">
                      <p className="text-white font-semibold flex items-center gap-2 justify-center">
                        <span className="text-green-400 text-lg">✓</span>
                        <span className="text-sm">Distância: 10-15cm do cupom</span>
                      </p>
                      <p className="text-white font-semibold flex items-center gap-2 justify-center">
                        <span className="text-green-400 text-lg">✓</span>
                        <span className="text-sm">Iluminação forte (sem reflexo)</span>
                      </p>
                      <p className="text-white font-semibold flex items-center gap-2 justify-center">
                        <span className="text-green-400 text-lg">✓</span>
                        <span className="text-sm">Segurar firme e centralizado</span>
                      </p>
                      <p className="text-white font-semibold flex items-center gap-2 justify-center">
                        <span className="text-green-400 text-lg">✓</span>
                        <span className="text-sm">QR limpo, plano e sem dobras</span>
                      </p>
                    </div>
                    
                    <p className="text-white/70 text-xs bg-blue-600/30 rounded-lg px-3 py-2 border border-blue-500/40">
                      🔥 Scanner Google otimizado para papel térmico
                    </p>
                  </div>
                  
                  <Button 
                    variant="secondary" 
                    onClick={handleClose}
                    className="mt-4 bg-red-600 hover:bg-red-700 text-white font-bold px-6 py-3 rounded-lg shadow-lg"
                  >
                    ✕ Cancelar Scanner
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
