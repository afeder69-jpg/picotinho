import { useState, useEffect, useRef, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { Button } from './ui/button';
import { toast } from '@/hooks/use-toast';
import { X, Flashlight, FlashlightOff, Keyboard, Camera } from 'lucide-react';
import ManualKeyInput from './ManualKeyInput';
import { construirUrlConsulta } from '@/lib/documentDetection';

interface QRCodeScannerWebProps {
  onScanSuccess: (data: string) => void;
  onClose: () => void;
}

const SCANNER_ID = 'html5-qrcode-scanner';

// Formatos otimizados para cupons fiscais brasileiros
const FORMATS_TO_SUPPORT = [
  Html5QrcodeSupportedFormats.QR_CODE,
  Html5QrcodeSupportedFormats.DATA_MATRIX,
];

const QRCodeScannerWeb = ({ onScanSuccess, onClose }: QRCodeScannerWebProps) => {
  const [isScanning, setIsScanning] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [showManualInput, setShowManualInput] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const hasScannedRef = useRef(false);

  const handleManualKeySubmit = useCallback((chaveAcesso: string) => {
    console.log('⌨️ [MANUAL KEY] Chave digitada:', chaveAcesso);
    
    const url = construirUrlConsulta(chaveAcesso);
    console.log('🔗 [MANUAL KEY] URL construída:', url);
    
    toast({
      title: "✅ Chave validada",
      description: "Processando nota fiscal...",
    });
    
    setShowManualInput(false);
    stopScanner();
    onScanSuccess(url);
  }, [onScanSuccess]);

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        const state = scannerRef.current.getState();
        if (state === 2) { // SCANNING
          await scannerRef.current.stop();
        }
        scannerRef.current.clear();
      } catch (e) {
        console.log('Scanner cleanup:', e);
      }
      scannerRef.current = null;
    }
  }, []);

  const handleScanSuccess = useCallback((decodedText: string) => {
    if (hasScannedRef.current) return;
    hasScannedRef.current = true;
    
    console.log('🔍 [WEB SCANNER OPTIMIZED] QR detectado:', decodedText);

    // Feedback háptico de sucesso
    if (navigator.vibrate) {
      navigator.vibrate([100, 50, 100]);
    }

    toast({
      title: "✅ QR Code detectado",
      description: "Processando nota fiscal...",
    });

    stopScanner();
    onScanSuccess(decodedText);
  }, [onScanSuccess, stopScanner]);

  const applyAdvancedCameraSettings = useCallback(async (scanner: Html5Qrcode) => {
    try {
      const capabilities = scanner.getRunningTrackCapabilities() as any;
      console.log('📷 [CAMERA] Capabilities:', capabilities);
      
      // Verificar suporte a torch
      if (capabilities?.torch) {
        setTorchSupported(true);
        console.log('🔦 [CAMERA] Torch suportado');
      }

      // Aplicar configurações avançadas
      const advancedConstraints: any[] = [];

      // Foco contínuo
      if (capabilities?.focusMode?.includes('continuous')) {
        advancedConstraints.push({ focusMode: 'continuous' } as any);
        console.log('🎯 [CAMERA] Foco contínuo ativado');
      }

      // Exposição contínua
      if ((capabilities as any).exposureMode?.includes('continuous')) {
        advancedConstraints.push({ exposureMode: 'continuous' } as any);
        console.log('💡 [CAMERA] Exposição contínua ativada');
      }

      if (advancedConstraints.length > 0) {
        await scanner.applyVideoConstraints({
          advanced: advancedConstraints
        } as any);
      }
    } catch (e) {
      console.log('⚠️ [CAMERA] Configurações avançadas não suportadas:', e);
    }
  }, []);

  const startScanner = useCallback(async () => {
    if (scannerRef.current || hasScannedRef.current) return;

    try {
      setIsInitializing(true);
      
      const scanner = new Html5Qrcode(SCANNER_ID, {
        formatsToSupport: FORMATS_TO_SUPPORT,
        verbose: false,
        experimentalFeatures: {
          useBarCodeDetectorIfSupported: true
        }
      });
      
      scannerRef.current = scanner;

      // Configuração otimizada para cupons fiscais
      const config = {
        fps: 15,
        qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
          const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
          const qrboxSize = Math.floor(minEdge * 0.75);
          return { width: qrboxSize, height: qrboxSize };
        },
        aspectRatio: 1.0,
        disableFlip: true,
        experimentalFeatures: {
          useBarCodeDetectorIfSupported: true
        }
      };

      // Constraints de vídeo otimizadas
      const videoConstraints = {
        facingMode: 'environment',
        width: { ideal: 1920, min: 640 },
        height: { ideal: 1080, min: 480 },
      };

      await scanner.start(
        { facingMode: 'environment' },
        config,
        handleScanSuccess,
        () => {} // Ignorar erros de scan contínuo
      );

      // Aplicar configurações avançadas após iniciar
      await applyAdvancedCameraSettings(scanner);

      setIsScanning(true);
      setIsInitializing(false);

      // Feedback háptico ao iniciar
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }

      console.log('✅ [SCANNER] Iniciado com sucesso');
    } catch (error) {
      console.error('❌ [SCANNER] Erro ao iniciar:', error);
      setIsInitializing(false);
      
      toast({
        title: "Erro ao acessar câmera",
        description: "Verifique as permissões e tente novamente.",
        variant: "destructive"
      });
    }
  }, [handleScanSuccess, applyAdvancedCameraSettings]);

  const toggleTorch = useCallback(async () => {
    if (!scannerRef.current || !torchSupported) {
      toast({
        title: "Flash não suportado",
        description: "Este dispositivo não suporta controle de flash via web",
        variant: "destructive"
      });
      return;
    }

    try {
      const newTorchState = !torchEnabled;
      await scannerRef.current.applyVideoConstraints({
        advanced: [{ torch: newTorchState }]
      } as any);
      setTorchEnabled(newTorchState);
      
      if (navigator.vibrate) {
        navigator.vibrate(30);
      }
    } catch (e) {
      console.error('❌ [TORCH] Erro:', e);
      toast({
        title: "Erro ao controlar flash",
        description: "Não foi possível alternar o flash",
        variant: "destructive"
      });
    }
  }, [torchEnabled, torchSupported]);

  const capturePhoto = useCallback(async () => {
    if (!scannerRef.current || isCapturing) return;

    setIsCapturing(true);
    
    try {
      // Pausar scanner para captura
      await scannerRef.current.pause(true);
      
      toast({
        title: "📸 Foto capturada",
        description: "Analisando imagem...",
      });

      // Tentar escanear o frame atual
      // Como não temos acesso direto ao frame, vamos retomar e aguardar
      await scannerRef.current.resume();
      
      // Aguardar um pouco para o próximo scan
      setTimeout(() => {
        setIsCapturing(false);
        if (!hasScannedRef.current) {
          toast({
            title: "QR Code não detectado",
            description: "Tente aproximar a câmera ou use a entrada manual",
            variant: "destructive"
          });
        }
      }, 2000);
    } catch (e) {
      console.error('❌ [CAPTURE] Erro:', e);
      setIsCapturing(false);
      
      // Tentar retomar o scanner
      try {
        await scannerRef.current?.resume();
      } catch {}
    }
  }, [isCapturing]);

  const handleClose = useCallback(() => {
    stopScanner();
    onClose();
  }, [stopScanner, onClose]);

  useEffect(() => {
    startScanner();
    
    return () => {
      stopScanner();
    };
  }, [startScanner, stopScanner]);

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col bg-black">
      {/* Header com controles */}
      <div className="relative z-10 w-full flex justify-between items-center p-4 bg-black/80 backdrop-blur-sm">
        <Button
          variant="outline"
          size="lg"
          className={`rounded-full ${torchEnabled ? 'bg-yellow-500 hover:bg-yellow-600' : ''}`}
          onClick={toggleTorch}
          disabled={!torchSupported && isScanning}
        >
          {torchEnabled ? (
            <FlashlightOff className="w-5 h-5" />
          ) : (
            <Flashlight className="w-5 h-5" />
          )}
        </Button>

        <Button
          variant="destructive"
          size="lg"
          className="rounded-full shadow-lg"
          onClick={handleClose}
        >
          <X className="w-6 h-6" />
          <span className="ml-2">Cancelar</span>
        </Button>
      </div>

      {/* Scanner Container */}
      <div className="flex-1 flex flex-col items-center justify-center relative overflow-hidden">
        {/* Scanner Element */}
        <div 
          id={SCANNER_ID} 
          className="w-full h-full"
          style={{ 
            position: 'relative',
            minHeight: '300px'
          }}
        />

        {/* Loading Overlay */}
        {isInitializing && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80">
            <div className="text-center">
              <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-white text-lg">Iniciando câmera...</p>
            </div>
          </div>
        )}

        {/* Aiming Corners Overlay */}
        {isScanning && !isInitializing && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="relative w-72 h-72 md:w-80 md:h-80">
              {/* Cantos do quadrado */}
              <div className="absolute top-0 left-0 w-12 h-12 border-t-4 border-l-4 border-primary rounded-tl-xl animate-pulse" />
              <div className="absolute top-0 right-0 w-12 h-12 border-t-4 border-r-4 border-primary rounded-tr-xl animate-pulse" />
              <div className="absolute bottom-0 left-0 w-12 h-12 border-b-4 border-l-4 border-primary rounded-bl-xl animate-pulse" />
              <div className="absolute bottom-0 right-0 w-12 h-12 border-b-4 border-r-4 border-primary rounded-br-xl animate-pulse" />
              
              {/* Linha de scan animada */}
              <div className="absolute inset-0 overflow-hidden">
                <div className="w-full h-1 bg-gradient-to-r from-transparent via-primary to-transparent animate-scan-line" />
              </div>
            </div>
          </div>
        )}

        {/* Instruções e controles adicionais */}
        {isScanning && !isInitializing && (
          <div className="absolute bottom-4 left-0 right-0 px-4">
            <div className="bg-background/95 backdrop-blur-md p-4 rounded-2xl shadow-2xl border border-primary/20 max-w-md mx-auto">
              <div className="flex items-center justify-center gap-3 mb-3">
                <div className="w-3 h-3 bg-primary rounded-full animate-pulse" />
                <p className="text-base font-bold text-center">
                  Escaneando QR Code
                </p>
              </div>
              
              <p className="text-xs text-muted-foreground text-center mb-4">
                Aponte para o QR Code do cupom fiscal
              </p>

              <div className="flex flex-col gap-2">
                {/* Botão de captura de foto */}
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={capturePhoto}
                  disabled={isCapturing}
                >
                  <Camera className="w-4 h-4 mr-2" />
                  {isCapturing ? 'Analisando...' : 'Tirar Foto do QR Code'}
                </Button>

                {/* Botão de entrada manual */}
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setShowManualInput(true)}
                >
                  <Keyboard className="w-4 h-4 mr-2" />
                  Digitar Chave Manualmente
                </Button>
              </div>

              {/* Dicas */}
              <div className="mt-3 pt-3 border-t border-border/50">
                <p className="text-xs text-muted-foreground text-center">
                  💡 Dicas: Aumente a iluminação • Aproxime a câmera • Use "Tirar Foto" se difícil
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* Modal de entrada manual */}
      {showManualInput && (
        <ManualKeyInput
          onSubmit={handleManualKeySubmit}
          onClose={() => setShowManualInput(false)}
        />
      )}

      {/* CSS para animação customizada */}
      <style>{`
        @keyframes scan-line {
          0% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(288px);
          }
          100% {
            transform: translateY(0);
          }
        }
        .animate-scan-line {
          animation: scan-line 2s ease-in-out infinite;
        }
        
        /* Estilizar o scanner html5-qrcode */
        #${SCANNER_ID} video {
          width: 100% !important;
          height: 100% !important;
          object-fit: cover !important;
        }
        
        #${SCANNER_ID} > div {
          border: none !important;
        }
        
        /* Esconder elementos padrão do html5-qrcode */
        #${SCANNER_ID}__scan_region > img,
        #${SCANNER_ID}__dashboard_section,
        #${SCANNER_ID}__dashboard_section_csr,
        #${SCANNER_ID}__dashboard_section_swaplink {
          display: none !important;
        }
      `}</style>
    </div>
  );
};

export default QRCodeScannerWeb;
