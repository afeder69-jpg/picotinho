import { useEffect, useState, useRef } from "react";
import { Scanner } from "@yudiel/react-qr-scanner";
import { X, Zap, Target, Camera as CameraIcon } from "lucide-react";
import { Button } from "./ui/button";
import { BarcodeScanner, BarcodeFormat, LensFacing } from '@capacitor-mlkit/barcode-scanning';
import { Capacitor } from '@capacitor/core';
import { toast } from "@/hooks/use-toast";
import { Html5Qrcode } from 'html5-qrcode';

interface QRCodeScannerProps {
  onScanSuccess: (result: string) => void;
  onClose: () => void;
  isOpen: boolean;
}

type ScanMode = 'fast' | 'precision' | 'photo';

const QRCodeScanner = ({ onScanSuccess, onClose, isOpen }: QRCodeScannerProps) => {
  const [isScanning, setIsScanning] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [useNativeScanner, setUseNativeScanner] = useState(false);
  const [scanMode, setScanMode] = useState<ScanMode>('fast');
  const [scanTime, setScanTime] = useState(0);
  const isNative = Capacitor.isNativePlatform();
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const scanTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const scanStartTimeRef = useRef<number>(0);

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

  const scanWithHtml5Qrcode = async (): Promise<boolean> => {
    try {
      console.log('🎯 Iniciando scanner de precisão html5-qrcode...');
      setScanMode('precision');
      
      toast({
        title: "🎯 Modo Precisão Ativado",
        description: "Scanner otimizado para NFCe em papel térmico",
        duration: 3000,
      });

      const html5QrCode = new Html5Qrcode("qr-reader");
      html5QrCodeRef.current = html5QrCode;

      const config = {
        fps: 10,
        qrbox: { width: 300, height: 300 },
        aspectRatio: 1.0,
        disableFlip: false,
      };

      const qrCodeSuccessCallback = (decodedText: string) => {
        console.log('✅ html5-qrcode detectou:', decodedText);
        
        if (isValidNFCeUrl(decodedText)) {
          console.log('✅ NFCe válida detectada!');
          stopHtml5Scanner();
          onScanSuccess(decodedText);
        } else {
          console.log('⚠️ Código detectado mas não é NFCe válida');
        }
      };

      await html5QrCode.start(
        { facingMode: "environment" },
        config,
        qrCodeSuccessCallback,
        undefined
      );

      return true;
    } catch (error) {
      console.error('❌ Erro ao iniciar html5-qrcode:', error);
      return false;
    }
  };

  const stopHtml5Scanner = async () => {
    if (html5QrCodeRef.current) {
      try {
        await html5QrCodeRef.current.stop();
        html5QrCodeRef.current = null;
        console.log('🛑 html5-qrcode parado');
      } catch (error) {
        console.error('Erro ao parar html5-qrcode:', error);
      }
    }
  };

  const scanWithStaticImage = async (): Promise<boolean> => {
    try {
      console.log('📸 Iniciando captura de imagem estática de alta resolução...');
      setScanMode('photo');
      
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
        console.log('❌ Foto não capturada');
        return false;
      }

      console.log('📷 Foto capturada, processando com ML Kit...');
      
      const { barcodes } = await BarcodeScanner.readBarcodesFromImage({
        path: photo.path,
        formats: [BarcodeFormat.QrCode],
      });

      if (barcodes && barcodes.length > 0) {
        const code = barcodes[0].rawValue;
        console.log('✅ QR Code detectado na foto:', code);
        
        if (code && isValidNFCeUrl(code)) {
          console.log('✅ NFCe válida na foto!');
          onScanSuccess(code);
          return true;
        }
      }
      
      console.log('⚠️ Nenhum QR Code válido detectado na foto');
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

  const tryMLKitScanner = async (): Promise<boolean> => {
    try {
      console.log('🚀 Iniciando ML Kit (Modo Rápido)...');
      setScanMode('fast');
      scanStartTimeRef.current = Date.now();
      
      toast({
        title: "🚀 Modo Rápido Ativo",
        description: "Escaneando... Mudará para modo precisão em 5s",
        duration: 3000,
      });

      // Adicionar listener para detectar códigos
      const listener = await BarcodeScanner.addListener('barcodeScanned', (result) => {
        if (result.barcode) {
          const code = result.barcode.rawValue;
          const elapsed = Date.now() - scanStartTimeRef.current;
          console.log(`✅ ML Kit detectou em ${elapsed}ms:`, code);
          
          if (code && isValidNFCeUrl(code)) {
            console.log('✅ NFCe válida detectada no modo rápido!');
            BarcodeScanner.stopScan();
            listener.remove();
            onScanSuccess(code);
          }
        }
      });

      await BarcodeScanner.startScan({
        formats: [BarcodeFormat.QrCode],
        lensFacing: LensFacing.Back,
      });

      return true;
    } catch (error) {
      console.error('❌ ML Kit falhou:', error);
      return false;
    }
  };

  const startNativeScanner = async () => {
    try {
      console.log('🎬 Iniciando estratégia de scanner híbrido em cascata...');
      setIsScanning(true);
      setScanTime(0);
      
      // ETAPA 1: Tentar ML Kit primeiro (0-5 segundos) - RÁPIDO para QR codes simples
      const mlKitSuccess = await tryMLKitScanner();
      
      if (!mlKitSuccess) {
        console.log('⚠️ ML Kit não disponível, pulando para modo precisão');
        await startPrecisionMode();
        return;
      }

      // Timeout para trocar para modo precisão após 5 segundos
      scanTimeoutRef.current = setTimeout(async () => {
        const elapsed = Date.now() - scanStartTimeRef.current;
        console.log(`⏱️ 5s decorridos (${elapsed}ms), trocando para modo precisão...`);
        
        await BarcodeScanner.stopScan();
        await startPrecisionMode();
      }, 5000);

      // Timeout para modo foto após 20 segundos total
      setTimeout(async () => {
        if (isScanning && scanMode !== 'photo') {
          console.log('⏱️ 20s decorridos, oferecendo modo foto...');
          await stopAllScanners();
          offerPhotoMode();
        }
      }, 20000);
      
    } catch (error) {
      console.error('❌ Erro no scanner híbrido:', error);
      setIsScanning(false);
      
      toast({
        title: "Erro ao processar QR Code",
        description: "Tente novamente com melhor iluminação",
        variant: "destructive"
      });
    }
  };

  const startPrecisionMode = async () => {
    console.log('🎯 Iniciando modo precisão...');
    
    // Se não estiver na web, usar foto de alta resolução como "modo precisão"
    if (isNative) {
      setScanMode('precision');
      toast({
        title: "🎯 Modo Precisão",
        description: "QR codes de NFCe precisam de foto em alta resolução",
        duration: 3000,
      });
      
      setTimeout(() => {
        offerPhotoMode();
      }, 2000);
    } else {
      // Na web, usar html5-qrcode
      await scanWithHtml5Qrcode();
    }
  };

  const offerPhotoMode = () => {
    setScanMode('photo');
    setIsScanning(true);
    
    toast({
      title: "📸 Modo Foto Disponível",
      description: "Tire uma foto em alta resolução do QR Code",
      duration: 5000,
    });
  };

  const stopAllScanners = async () => {
    if (scanTimeoutRef.current) {
      clearTimeout(scanTimeoutRef.current);
      scanTimeoutRef.current = null;
    }
    
    try {
      await BarcodeScanner.stopScan();
    } catch {}
    
    await stopHtml5Scanner();
  };

  const handleTakePhoto = async () => {
    await stopAllScanners();
    const success = await scanWithStaticImage();
    
    if (!success) {
      setScanMode('photo');
      toast({
        title: "Tentar novamente?",
        description: "Clique em 'Tirar Foto' para tentar outra vez",
        duration: 5000,
      });
    } else {
      setIsScanning(false);
    }
  };

  const skipToPrecisionMode = async () => {
    console.log('⏭️ Usuário pulou para modo precisão');
    await BarcodeScanner.stopScan();
    if (scanTimeoutRef.current) {
      clearTimeout(scanTimeoutRef.current);
    }
    await startPrecisionMode();
  };

  const stopScanner = async () => {
    await stopAllScanners();
    setIsScanning(false);
    setHasPermission(null);
    setUseNativeScanner(false);
    setScanMode('fast');
    setScanTime(0);
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
                <div className="flex flex-col items-center justify-center py-8 space-y-6 bg-gradient-to-b from-primary/20 to-background">
                  {/* Indicador de modo ativo */}
                  <div className="relative w-32 h-32">
                    {scanMode === 'fast' && (
                      <>
                        <div className="absolute inset-0 bg-primary/20 rounded-full animate-pulse"></div>
                        <div className="absolute inset-4 bg-primary/40 rounded-full flex items-center justify-center">
                          <Zap className="w-16 h-16 text-primary animate-pulse" />
                        </div>
                      </>
                    )}
                    {scanMode === 'precision' && (
                      <>
                        <div className="absolute inset-0 bg-green-500/20 rounded-full animate-pulse"></div>
                        <div className="absolute inset-4 bg-green-500/40 rounded-full flex items-center justify-center">
                          <Target className="w-16 h-16 text-green-500" />
                        </div>
                      </>
                    )}
                    {scanMode === 'photo' && (
                      <>
                        <div className="absolute inset-0 bg-blue-500/20 rounded-full animate-pulse"></div>
                        <div className="absolute inset-4 bg-blue-500/40 rounded-full flex items-center justify-center">
                          <CameraIcon className="w-16 h-16 text-blue-500" />
                        </div>
                      </>
                    )}
                  </div>
                  
                  {/* Status do modo */}
                  <div className="flex items-center gap-2 px-4 py-2 bg-card rounded-full border-2 border-primary/30">
                    {scanMode === 'fast' && (
                      <>
                        <Zap className="w-4 h-4 text-primary" />
                        <span className="text-sm font-bold text-primary">Modo Rápido</span>
                      </>
                    )}
                    {scanMode === 'precision' && (
                      <>
                        <Target className="w-4 h-4 text-green-500" />
                        <span className="text-sm font-bold text-green-500">Modo Precisão</span>
                      </>
                    )}
                    {scanMode === 'photo' && (
                      <>
                        <CameraIcon className="w-4 h-4 text-blue-500" />
                        <span className="text-sm font-bold text-blue-500">Modo Foto</span>
                      </>
                    )}
                  </div>
                  
                  {/* Instruções baseadas no modo */}
                  <div className="space-y-3 text-center px-6 max-w-sm">
                    {scanMode === 'fast' && (
                      <>
                        <p className="text-xl font-bold text-primary">
                          🚀 Escaneando em Modo Rápido
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Aponte para o QR Code... Se não detectar em 5s, mudará automaticamente para modo precisão.
                        </p>
                      </>
                    )}
                    
                    {scanMode === 'precision' && (
                      <>
                        <p className="text-xl font-bold text-green-500">
                          🎯 Modo Precisão para NFCe
                        </p>
                        <p className="text-sm text-muted-foreground">
                          QR codes de NFCe em papel térmico precisam de foto em alta resolução. Clique no botão abaixo.
                        </p>
                      </>
                    )}
                    
                    {scanMode === 'photo' && (
                      <>
                        <p className="text-xl font-bold text-blue-500">
                          📸 Tire uma Foto do QR Code
                        </p>
                        
                        <div className="bg-card rounded-xl p-3 space-y-2 border-2 border-blue-500/30">
                          <p className="text-foreground text-xs flex items-center gap-2 justify-center">
                            <span className="text-blue-500">✓</span>
                            Distância: 10-15cm do cupom
                          </p>
                          <p className="text-foreground text-xs flex items-center gap-2 justify-center">
                            <span className="text-blue-500">✓</span>
                            Iluminação forte e uniforme
                          </p>
                          <p className="text-foreground text-xs flex items-center gap-2 justify-center">
                            <span className="text-blue-500">✓</span>
                            QR Code plano, limpo e centralizado
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                  
                  {/* Botões de ação */}
                  <div className="flex flex-col gap-2 mt-4 w-full px-6">
                    {scanMode === 'fast' && (
                      <Button 
                        onClick={skipToPrecisionMode}
                        variant="outline"
                        className="w-full"
                      >
                        ⏭️ Pular para Modo Precisão
                      </Button>
                    )}
                    
                    {(scanMode === 'precision' || scanMode === 'photo') && (
                      <Button 
                        onClick={handleTakePhoto}
                        className="bg-blue-500 hover:bg-blue-600 text-white font-bold w-full"
                      >
                        📸 Tirar Foto em Alta Resolução
                      </Button>
                    )}
                    
                    <Button 
                      variant="secondary" 
                      onClick={handleClose}
                      className="w-full"
                    >
                      ✕ Cancelar
                    </Button>
                  </div>
                  
                  <p className="text-muted-foreground text-xs bg-primary/10 rounded-lg px-3 py-2 border border-primary/20 mx-6">
                    💡 Scanner híbrido: tenta modo rápido → precisão → foto
                  </p>
                </div>
              ) : scanMode === 'precision' && !isNative ? (
                <div className="w-full aspect-square bg-black relative">
                  <div id="qr-reader" className="w-full h-full"></div>
                  <div className="absolute bottom-0 left-0 right-0 p-4 text-center text-sm text-white bg-green-500/90">
                    🎯 Modo Precisão - Otimizado para NFCe
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
