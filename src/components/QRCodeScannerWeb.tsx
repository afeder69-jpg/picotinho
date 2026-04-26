import { useState, useEffect, useRef, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { Button } from './ui/button';
import { toast } from '@/hooks/use-toast';
import { X, Flashlight, FlashlightOff, Keyboard, ArrowLeft, QrCode, ScanBarcode } from 'lucide-react';
import ManualKeyInput from './ManualKeyInput';
import { construirUrlConsulta, limparChaveAcesso, validarChaveAcesso } from '@/lib/documentDetection';

interface QRCodeScannerWebProps {
  onScanSuccess: (data: string) => void;
  onClose: () => void;
}

const SCANNER_ID = 'html5-qrcode-scanner';

const QR_FORMATS_TO_SUPPORT = [
  Html5QrcodeSupportedFormats.QR_CODE,
  Html5QrcodeSupportedFormats.DATA_MATRIX,
];

const BARCODE_FORMATS_TO_SUPPORT = [
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.CODE_93,
  Html5QrcodeSupportedFormats.CODABAR,
  Html5QrcodeSupportedFormats.ITF,
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
];

type ScannerMode = 'choose' | 'scanning' | 'manual' | 'barcode';

const QRCodeScannerWeb = ({ onScanSuccess, onClose }: QRCodeScannerWebProps) => {
  const [mode, setMode] = useState<ScannerMode>('choose');
  const [isScanning, setIsScanning] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [showHelpBanner, setShowHelpBanner] = useState(false);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const hasScannedRef = useRef(false);
  const scanStartTimeRef = useRef<number>(0);
  const decodeFailuresRef = useRef<number>(0);
  const helpBannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const torchPollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const videoTrackRef = useRef<MediaStreamTrack | null>(null);

  // iOS Safari não suporta torch via WebRTC
  const isIOS = typeof navigator !== 'undefined' &&
    (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && (navigator as any).maxTouchPoints > 1));

  // Obtém o MediaStreamTrack ativo diretamente do <video> renderizado pela lib
  const getActiveVideoTrack = useCallback((): MediaStreamTrack | null => {
    try {
      const container = document.getElementById(SCANNER_ID);
      const video = container?.querySelector('video') as HTMLVideoElement | null;
      const stream = video?.srcObject as MediaStream | null;
      const track = stream?.getVideoTracks?.()[0] ?? null;
      return track ?? null;
    } catch {
      return null;
    }
  }, []);

  const processAccessKey = useCallback((chaveAcesso: string, source: 'manual' | 'barcode') => {
    const chaveLimpa = limparChaveAcesso(chaveAcesso);
    const validacao = validarChaveAcesso(chaveLimpa);

    if (!validacao.valida) {
      toast({
        title: source === 'barcode' ? 'Código de barras inválido' : 'Chave inválida',
        description: validacao.erro || 'Não foi possível validar a chave de acesso.',
        variant: 'destructive'
      });
      setMode('choose');
      return;
    }

    const url = construirUrlConsulta(chaveLimpa);
    toast({ title: '✅ Chave validada', description: 'Processando nota fiscal...' });
    onScanSuccess(url);
  }, [onScanSuccess]);

  const handleManualKeySubmit = useCallback((chaveAcesso: string) => {
    processAccessKey(chaveAcesso, 'manual');
  }, [processAccessKey]);

  const stopScanner = useCallback(async () => {
    if (helpBannerTimerRef.current) {
      clearTimeout(helpBannerTimerRef.current);
      helpBannerTimerRef.current = null;
    }
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
    setIsInitializing(false);
    setTorchEnabled(false);
    setTorchSupported(false);
    setShowHelpBanner(false);
    hasScannedRef.current = false;
    decodeFailuresRef.current = 0;
  }, []);

  const handleScanSuccess = useCallback((decodedText: string) => {
    if (hasScannedRef.current) return;
    hasScannedRef.current = true;

    const elapsed = scanStartTimeRef.current ? Date.now() - scanStartTimeRef.current : 0;
    console.log('[SCANNER-DIAG] ✅ Decode OK', {
      mode,
      tempo_ate_leitura_ms: elapsed,
      falhas_silenciosas: decodeFailuresRef.current,
      tamanho_texto: decodedText?.length ?? 0,
    });

    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);

    if (mode === 'barcode') {
      stopScanner();
      processAccessKey(decodedText, 'barcode');
      return;
    }

    toast({ title: '✅ QR Code detectado', description: 'Processando nota fiscal...' });
    stopScanner();
    onScanSuccess(decodedText);
  }, [mode, onScanSuccess, processAccessKey, stopScanner]);

  const applyAdvancedCameraSettings = useCallback(async (scanner: Html5Qrcode) => {
    try {
      const capabilities = scanner.getRunningTrackCapabilities() as any;
      const settings = (scanner.getRunningTrackSettings?.() as any) || {};

      console.log('[SCANNER-DIAG] 📷 Camera capabilities', {
        torch: !!capabilities?.torch,
        zoom: capabilities?.zoom,
        focusMode: capabilities?.focusMode,
        focusDistance: capabilities?.focusDistance,
        width: settings.width,
        height: settings.height,
        frameRate: settings.frameRate,
      });

      if (capabilities?.torch) setTorchSupported(true);

      const advancedConstraints: any[] = [];
      if (capabilities?.focusMode?.includes?.('continuous')) {
        advancedConstraints.push({ focusMode: 'continuous' });
      }
      if (capabilities?.exposureMode?.includes?.('continuous')) {
        advancedConstraints.push({ exposureMode: 'continuous' });
      }
      if (advancedConstraints.length > 0) {
        try {
          await scanner.applyVideoConstraints({ advanced: advancedConstraints } as any);
        } catch (e) {
          console.log('[SCANNER-DIAG] ⚠️ focus/exposure não aplicados:', e);
        }
      }

      // Zoom automático ~2x quando suportado (ajuda em QRs pequenos)
      try {
        const zoomCap = capabilities?.zoom;
        if (zoomCap && typeof zoomCap.max === 'number') {
          const desired = Math.min(2, zoomCap.max);
          if (desired >= (zoomCap.min ?? 1)) {
            await scanner.applyVideoConstraints({ advanced: [{ zoom: desired }] } as any);
            console.log('[SCANNER-DIAG] 🔍 Zoom aplicado:', desired);
          }
        }
      } catch (e) {
        console.log('[SCANNER-DIAG] ⚠️ Zoom não suportado:', e);
      }

      // Macro: focusDistance perto do mínimo
      try {
        const fd = capabilities?.focusDistance;
        if (fd && typeof fd.min === 'number') {
          const desired = Math.max(fd.min, Math.min(0.1, fd.max ?? 0.1));
          await scanner.applyVideoConstraints({ advanced: [{ focusMode: 'manual', focusDistance: desired }] } as any);
          console.log('[SCANNER-DIAG] 🎯 Macro focus aplicado:', desired);
        }
      } catch (e) {
        console.log('[SCANNER-DIAG] ⚠️ focusDistance não suportado:', e);
      }
    } catch (e) {
      console.log('[SCANNER-DIAG] ⚠️ Capabilities indisponíveis:', e);
    }
  }, []);

  const startScanner = useCallback(async () => {
    if (scannerRef.current || hasScannedRef.current) return;
    try {
      setIsInitializing(true);
      setShowHelpBanner(false);
      decodeFailuresRef.current = 0;
      const formatsToSupport = mode === 'barcode' ? BARCODE_FORMATS_TO_SUPPORT : QR_FORMATS_TO_SUPPORT;
      const scanner = new Html5Qrcode(SCANNER_ID, {
        formatsToSupport,
        verbose: false,
        experimentalFeatures: { useBarCodeDetectorIfSupported: true }
      });
      scannerRef.current = scanner;

      const config = {
        fps: 24,
        qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
          const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
          const boxSize = Math.floor(minEdge * 0.62);
          return { width: boxSize, height: boxSize };
        },
        aspectRatio: 1.0,
        disableFlip: true,
        videoConstraints: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920, min: 1280 },
          height: { ideal: 1080, min: 720 },
          frameRate: { ideal: 30, min: 24 },
        },
        experimentalFeatures: { useBarCodeDetectorIfSupported: true }
      };

      scanStartTimeRef.current = Date.now();

      await scanner.start(
        { facingMode: 'environment' },
        config as any,
        handleScanSuccess,
        () => {
          decodeFailuresRef.current += 1;
        }
      );
      await applyAdvancedCameraSettings(scanner);
      setIsScanning(true);
      setIsInitializing(false);
      if (navigator.vibrate) navigator.vibrate(50);

      // Banner de ajuda após 8s sem leitura
      if (helpBannerTimerRef.current) clearTimeout(helpBannerTimerRef.current);
      helpBannerTimerRef.current = setTimeout(() => {
        if (!hasScannedRef.current) {
          setShowHelpBanner(true);
          console.log('[SCANNER-DIAG] ⏱️ 8s sem leitura', {
            falhas_silenciosas: decodeFailuresRef.current,
          });
        }
      }, 8000);
    } catch (error) {
      console.error('❌ [SCANNER] Erro ao iniciar:', error);
      setIsInitializing(false);
      toast({
        title: 'Erro ao acessar câmera',
        description: mode === 'barcode'
          ? 'Não foi possível iniciar o leitor do código de barras. Verifique as permissões e tente novamente.'
          : 'Verifique as permissões e tente novamente.',
        variant: 'destructive'
      });
      setMode('choose');
    }
  }, [applyAdvancedCameraSettings, handleScanSuccess, mode]);

  const toggleTorch = useCallback(async () => {
    if (!scannerRef.current || !torchSupported) {
      toast({ title: 'Flash não suportado', description: 'Este dispositivo não suporta controle de flash via web', variant: 'destructive' });
      return;
    }
    try {
      const newTorchState = !torchEnabled;
      await scannerRef.current.applyVideoConstraints({ advanced: [{ torch: newTorchState }] } as any);
      setTorchEnabled(newTorchState);
      if (navigator.vibrate) navigator.vibrate(30);
    } catch (e) {
      toast({ title: 'Erro ao controlar flash', description: 'Não foi possível alternar o flash', variant: 'destructive' });
    }
  }, [torchEnabled, torchSupported]);

  const handleBackToChoose = useCallback(() => {
    stopScanner();
    setMode('choose');
  }, [stopScanner]);

  useEffect(() => {
    if (mode === 'scanning' || mode === 'barcode') {
      startScanner();
    }
    return () => {
      if (mode === 'scanning' || mode === 'barcode') {
        stopScanner();
      }
    };
  }, [mode, startScanner, stopScanner]);

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
            <Button variant="outline" size="lg" className="w-full h-20 text-lg flex flex-col items-center gap-1" onClick={() => setMode('barcode')}>
              <ScanBarcode className="w-7 h-7" />
              Ler Código de Barras da Chave
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'manual') {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70">
        <ManualKeyInput onSubmit={handleManualKeySubmit} onClose={() => setMode('choose')} />
      </div>
    );
  }

  const scannerTitle = mode === 'barcode' ? 'Lendo código de barras da chave' : 'Escaneando QR Code';
  const scannerDescription = mode === 'barcode'
    ? 'Aponte para o código de barras da chave de acesso da nota fiscal'
    : 'Aponte para o QR Code do cupom fiscal';
  const scannerTips = mode === 'barcode'
    ? '💡 Dicas: Centralize o código de barras • Mantenha o documento reto e bem iluminado'
    : '💡 Dicas: Aumente a iluminação • Aproxime a câmera do QR Code';

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col bg-black">
      <div className="relative z-10 w-full flex justify-between items-center p-4 bg-black/80 backdrop-blur-sm">
        <Button
          variant="outline"
          size="lg"
          className="rounded-full"
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
              <p className="text-primary-foreground text-lg">
                {mode === 'barcode' ? 'Iniciando leitor de código de barras...' : 'Iniciando câmera...'}
              </p>
            </div>
          </div>
        )}

        {isScanning && !isInitializing && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className={`relative ${mode === 'barcode' ? 'w-80 h-40 md:w-96 md:h-44' : 'w-72 h-72 md:w-80 md:h-80'}`}>
              <div className="absolute top-0 left-0 w-12 h-12 border-t-4 border-l-4 border-primary rounded-tl-xl animate-pulse" />
              <div className="absolute top-0 right-0 w-12 h-12 border-t-4 border-r-4 border-primary rounded-tr-xl animate-pulse" />
              <div className="absolute bottom-0 left-0 w-12 h-12 border-b-4 border-l-4 border-primary rounded-bl-xl animate-pulse" />
              <div className="absolute bottom-0 right-0 w-12 h-12 border-b-4 border-r-4 border-primary rounded-br-xl animate-pulse" />
              <div className="absolute inset-0 overflow-hidden">
                <div className={`bg-gradient-to-r from-transparent via-primary to-transparent animate-scan-line ${mode === 'barcode' ? 'w-full h-1 mt-[calc(50%-2px)]' : 'w-full h-1'}`} />
              </div>
            </div>
          </div>
        )}

        {isScanning && !isInitializing && (
          <div className="absolute bottom-4 left-0 right-0 px-4">
            <div className="bg-background/95 backdrop-blur-md p-4 rounded-2xl shadow-2xl border border-primary/20 max-w-md mx-auto">
              <div className="flex items-center justify-center gap-3 mb-3">
                <div className="w-3 h-3 bg-primary rounded-full animate-pulse" />
                <p className="text-base font-bold text-center">{scannerTitle}</p>
              </div>
              <p className="text-xs text-muted-foreground text-center mb-4">{scannerDescription}</p>
              <div className="mt-3 pt-3 border-t border-border/50">
                <p className="text-xs text-muted-foreground text-center">{scannerTips}</p>
              </div>
              {showHelpBanner && (
                <div className="mt-3 pt-3 border-t border-primary/30">
                  <p className="text-sm font-semibold text-primary text-center">
                    Aproxime mais o código • aumente a luz • use o flash
                  </p>
                </div>
              )}
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
