import { useState, useEffect, useRef, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { Button } from './ui/button';
import { toast } from '@/hooks/use-toast';
import { X, Flashlight, FlashlightOff, Keyboard, ArrowLeft, QrCode } from 'lucide-react';
import ManualKeyInput from './ManualKeyInput';
import { construirUrlConsulta } from '@/lib/documentDetection';

interface QRCodeScannerWebProps {
  onScanSuccess: (data: string) => void;
  onClose: () => void;
}

const SCANNER_ID = 'html5-qrcode-scanner';

const FORMATS_TO_SUPPORT = [
  Html5QrcodeSupportedFormats.QR_CODE,
  Html5QrcodeSupportedFormats.DATA_MATRIX,
];

type ScannerMode = 'choose' | 'scanning' | 'manual';

const QRCodeScannerWeb = ({ onScanSuccess, onClose }: QRCodeScannerWebProps) => {
  const [mode, setMode] = useState<ScannerMode>('choose');
  const [isScanning, setIsScanning] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const hasScannedRef = useRef(false);

  const handleManualKeySubmit = useCallback((chaveAcesso: string) => {
    const url = construirUrlConsulta(chaveAcesso);
    toast({ title: "✅ Chave validada", description: "Processando nota fiscal..." });
    onScanSuccess(url);
  }, [onScanSuccess]);

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        const state = scannerRef.current.getState();
        if (state === 2) {
          await scannerRef.current.stop();
        }
        scannerRef.current.clear();
      } catch (e) {
        console.log('Scanner cleanup:', e);
      }
      scannerRef.current = null;
    }
    setIsScanning(false);
  }, []);

  const handleScanSuccess = useCallback((decodedText: string) => {
    if (hasScannedRef.current) return;
    hasScannedRef.current = true;
    
    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
    toast({ title: "✅ QR Code detectado", description: "Processando nota fiscal..." });
    stopScanner();
    onScanSuccess(decodedText);
  }, [onScanSuccess, stopScanner]);

  const applyAdvancedCameraSettings = useCallback(async (scanner: Html5Qrcode) => {
    try {
      const capabilities = scanner.getRunningTrackCapabilities() as any;
      if (capabilities?.torch) setTorchSupported(true);
      const advancedConstraints: any[] = [];
      if (capabilities?.focusMode?.includes('continuous')) advancedConstraints.push({ focusMode: 'continuous' });
      if (capabilities?.exposureMode?.includes('continuous')) advancedConstraints.push({ exposureMode: 'continuous' });
      if (advancedConstraints.length > 0) {
        await scanner.applyVideoConstraints({ advanced: advancedConstraints } as any);
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
        experimentalFeatures: { useBarCodeDetectorIfSupported: true }
      });
      scannerRef.current = scanner;

      const config = {
        fps: 15,
        qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
          const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
          const qrboxSize = Math.floor(minEdge * 0.75);
          return { width: qrboxSize, height: qrboxSize };
        },
        aspectRatio: 1.0,
        disableFlip: true,
        experimentalFeatures: { useBarCodeDetectorIfSupported: true }
      };

      await scanner.start(
        { facingMode: 'environment' },
        config,
        handleScanSuccess,
        () => {}
      );
      await applyAdvancedCameraSettings(scanner);
      setIsScanning(true);
      setIsInitializing(false);
      if (navigator.vibrate) navigator.vibrate(50);
    } catch (error) {
      console.error('❌ [SCANNER] Erro ao iniciar:', error);
      setIsInitializing(false);
      toast({ title: "Erro ao acessar câmera", description: "Verifique as permissões e tente novamente.", variant: "destructive" });
      setMode('choose');
    }
  }, [handleScanSuccess, applyAdvancedCameraSettings]);

  const toggleTorch = useCallback(async () => {
    if (!scannerRef.current || !torchSupported) {
      toast({ title: "Flash não suportado", description: "Este dispositivo não suporta controle de flash via web", variant: "destructive" });
      return;
    }
    try {
      const newTorchState = !torchEnabled;
      await scannerRef.current.applyVideoConstraints({ advanced: [{ torch: newTorchState }] } as any);
      setTorchEnabled(newTorchState);
      if (navigator.vibrate) navigator.vibrate(30);
    } catch (e) {
      toast({ title: "Erro ao controlar flash", description: "Não foi possível alternar o flash", variant: "destructive" });
    }
  }, [torchEnabled, torchSupported]);

  const handleBackToChoose = useCallback(() => {
    stopScanner();
    setMode('choose');
  }, [stopScanner]);

  // Start scanner when mode changes to 'scanning'
  useEffect(() => {
    if (mode === 'scanning') {
      startScanner();
    }
    return () => {
      if (mode === 'scanning') {
        stopScanner();
      }
    };
  }, [mode]);

  // Tela de escolha
  if (mode === 'choose') {
    return (
      <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background">
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-4">
          <Button variant="ghost" size="lg" onClick={onClose}>
            <ArrowLeft className="w-5 h-5 mr-2" />
            Voltar
          </Button>
        </div>
        <div className="flex flex-col items-center gap-8 px-6 max-w-sm w-full">
          <div className="text-center">
            <h2 className="text-2xl font-bold mb-2">Ler Nota Fiscal</h2>
            <p className="text-muted-foreground">Escolha como deseja informar a nota fiscal</p>
          </div>
          <div className="flex flex-col gap-4 w-full">
            <Button size="lg" className="w-full h-20 text-lg flex flex-col items-center gap-1" onClick={() => setMode('scanning')}>
              <QrCode className="w-7 h-7" />
              Escanear QR Code
            </Button>
            <Button variant="outline" size="lg" className="w-full h-20 text-lg flex flex-col items-center gap-1" onClick={() => setMode('manual')}>
              <Keyboard className="w-7 h-7" />
              Digitar Chave Manualmente
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Tela de entrada manual
  if (mode === 'manual') {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70">
        <ManualKeyInput onSubmit={handleManualKeySubmit} onClose={() => setMode('choose')} />
      </div>
    );
  }

  // Modo scanning
  return (
    <div className="fixed inset-0 z-[9999] flex flex-col bg-black">
      <div className="relative z-10 w-full flex justify-between items-center p-4 bg-black/80 backdrop-blur-sm">
        <Button
          variant="outline"
          size="lg"
          className={`rounded-full ${torchEnabled ? 'bg-yellow-500 hover:bg-yellow-600' : ''}`}
          onClick={toggleTorch}
          disabled={!torchSupported && isScanning}
        >
          {torchEnabled ? <FlashlightOff className="w-5 h-5" /> : <Flashlight className="w-5 h-5" />}
        </Button>
        <Button variant="destructive" size="lg" className="rounded-full shadow-lg" onClick={handleBackToChoose}>
          <X className="w-6 h-6" />
          <span className="ml-2">Cancelar</span>
        </Button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center relative overflow-hidden">
        <div id={SCANNER_ID} className="w-full h-full" style={{ position: 'relative', minHeight: '300px' }} />

        {isInitializing && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80">
            <div className="text-center">
              <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-white text-lg">Iniciando câmera...</p>
            </div>
          </div>
        )}

        {isScanning && !isInitializing && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="relative w-72 h-72 md:w-80 md:h-80">
              <div className="absolute top-0 left-0 w-12 h-12 border-t-4 border-l-4 border-primary rounded-tl-xl animate-pulse" />
              <div className="absolute top-0 right-0 w-12 h-12 border-t-4 border-r-4 border-primary rounded-tr-xl animate-pulse" />
              <div className="absolute bottom-0 left-0 w-12 h-12 border-b-4 border-l-4 border-primary rounded-bl-xl animate-pulse" />
              <div className="absolute bottom-0 right-0 w-12 h-12 border-b-4 border-r-4 border-primary rounded-br-xl animate-pulse" />
              <div className="absolute inset-0 overflow-hidden">
                <div className="w-full h-1 bg-gradient-to-r from-transparent via-primary to-transparent animate-scan-line" />
              </div>
            </div>
          </div>
        )}

        {isScanning && !isInitializing && (
          <div className="absolute bottom-4 left-0 right-0 px-4">
            <div className="bg-background/95 backdrop-blur-md p-4 rounded-2xl shadow-2xl border border-primary/20 max-w-md mx-auto">
              <div className="flex items-center justify-center gap-3 mb-3">
                <div className="w-3 h-3 bg-primary rounded-full animate-pulse" />
                <p className="text-base font-bold text-center">Escaneando QR Code</p>
              </div>
              <p className="text-xs text-muted-foreground text-center mb-4">Aponte para o QR Code do cupom fiscal</p>
              <div className="mt-3 pt-3 border-t border-border/50">
                <p className="text-xs text-muted-foreground text-center">💡 Dicas: Aumente a iluminação • Aproxime a câmera do QR Code</p>
              </div>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes scan-line { 0% { transform: translateY(0); } 50% { transform: translateY(288px); } 100% { transform: translateY(0); } }
        .animate-scan-line { animation: scan-line 2s ease-in-out infinite; }
        #${SCANNER_ID} video { width: 100% !important; height: 100% !important; object-fit: cover !important; }
        #${SCANNER_ID} > div { border: none !important; }
        #${SCANNER_ID}__scan_region > img, #${SCANNER_ID}__dashboard_section, #${SCANNER_ID}__dashboard_section_csr, #${SCANNER_ID}__dashboard_section_swaplink { display: none !important; }
      `}</style>
    </div>
  );
};

export default QRCodeScannerWeb;
