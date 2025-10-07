import React, { useState, useEffect, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { X, AlertCircle } from "lucide-react";
import { Capacitor } from '@capacitor/core';
import { Html5Qrcode } from 'html5-qrcode';
import { useToast } from "@/hooks/use-toast";
import { registerPlugin } from '@capacitor/core';

interface MLKitScannerPlugin {
  scanBarcode(): Promise<{ ScanResult: string }>;
}

const MLKitScanner = registerPlugin<MLKitScannerPlugin>('MLKitScanner');

interface QRCodeScannerProps {
  onScanSuccess: (code: string) => void;
  onClose: () => void;
  isOpen: boolean;
}

const QRCodeScanner: React.FC<QRCodeScannerProps> = ({ onScanSuccess, onClose, isOpen }) => {
  const [isScanning, setIsScanning] = useState(false);
  const [showTroubleshooting, setShowTroubleshooting] = useState(false);
  const [scannerReady, setScannerReady] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false); // ✨ NOVO: Estado para feedback visual
  const [zoomLevel, setZoomLevel] = useState(() => {
    const saved = localStorage.getItem('qr-scanner-zoom');
    return saved ? parseFloat(saved) : 1.5;
  });
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannerContainerRef = useRef<HTMLDivElement>(null);
  const useNativeScanner = Capacitor.isNativePlatform();
  const { toast } = useToast();

  useEffect(() => {
    if (isOpen && useNativeScanner) {
      // Wrapper assíncrono com timeout
      (async () => {
        const timeoutId = setTimeout(() => {
          console.error('⏱️ Timeout: Scanner não abriu em 5 segundos');
          toast({
            title: "❌ Erro ao Abrir Scanner",
            description: "O scanner demorou muito para responder. Tente novamente.",
            variant: "destructive",
            duration: 5000,
          });
          setIsScanning(false);
          onClose();
        }, 5000);

        try {
          await startNativeScanner();
        } catch (error) {
          console.error('❌ Erro ao iniciar scanner:', error);
        } finally {
          clearTimeout(timeoutId);
        }
      })();
    } else if (isOpen && !useNativeScanner) {
      startWebScanner();
    }

    return () => {
      cleanupWebScanner();
    };
  }, [isOpen]);

  const startWebScanner = async () => {
    if (!scannerContainerRef.current) return;

    try {
      console.log('🎥 Iniciando scanner web otimizado com zoom...');
      setIsScanning(true);

      const html5QrCode = new Html5Qrcode('qr-reader');
      scannerRef.current = html5QrCode;

      const config = {
        fps: 30,
        qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
          const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
          const qrboxSize = Math.floor(minEdge * 0.7);
          console.log('📐 Dimensões da câmera:', viewfinderWidth, 'x', viewfinderHeight);
          console.log('📦 Área de detecção (qrbox):', qrboxSize, 'x', qrboxSize);
          return { width: qrboxSize, height: qrboxSize };
        },
        aspectRatio: 1920 / 1080,
      };

      await html5QrCode.start(
        { facingMode: 'environment' },
        config,
        handleWebScanSuccess,
        handleWebScanError
      );

      console.log('✅ Scanner web iniciado com zoom', zoomLevel + 'x');
      
      // 🔍 Aplicar zoom digital no vídeo
      setTimeout(() => {
        const videoElement = document.querySelector('#qr-reader video') as HTMLVideoElement;
        if (videoElement) {
          videoElement.style.transform = `scale(${zoomLevel})`;
          videoElement.style.transformOrigin = 'center center';
          console.log('🔎 Zoom aplicado:', zoomLevel + 'x');
        }
      }, 500);

      setScannerReady(true);
      
      toast({
        title: "📷 Scanner Ativo",
        description: `Zoom ${zoomLevel}x | Procurando QR Code...`,
        duration: 2000,
      });
    } catch (error) {
      console.error('❌ Erro ao iniciar scanner:', error);
      toast({
        title: "Erro ao Iniciar Câmera",
        description: "Verifique as permissões da câmera",
        variant: "destructive",
      });
    }
  };

  const cleanupWebScanner = async () => {
    if (scannerRef.current && scannerRef.current.isScanning) {
      try {
        await scannerRef.current.stop();
        console.log('🛑 Scanner web parado');
      } catch (error) {
        console.error('Erro ao parar scanner:', error);
      }
    }
    setIsScanning(false);
    setScannerReady(false);
  };

  const handleWebScanSuccess = (decodedText: string) => {
    console.log('🌐 QR Code detectado (web):', decodedText);

    // ✨ ETAPA 1: ACEITAR QUALQUER QR CODE (sem validação restritiva)
    setIsDetecting(true); // ✨ ETAPA 2: Ativar feedback visual
    
    // Vibração de feedback (se disponível)
    if (navigator.vibrate) {
      navigator.vibrate(200);
    }
    
    toast({
      title: "✅ QR Code Detectado!",
      description: "Processando...",
      duration: 2000,
    });
    
    // Reset do feedback visual após 1 segundo
    setTimeout(() => setIsDetecting(false), 1000);
    
    cleanupWebScanner();
    onScanSuccess(decodedText);
    onClose();
  };

  const handleWebScanError = (errorMessage: string) => {
    // ✨ ETAPA 3: Melhorar logs - mostrar TODOS os erros para debug
    console.log('📸 Scanner tentando detectar...', errorMessage);
  };

  const adjustZoom = (delta: number) => {
    const newZoom = Math.max(1, Math.min(3, zoomLevel + delta));
    setZoomLevel(newZoom);
    localStorage.setItem('qr-scanner-zoom', newZoom.toString());
    
    const videoElement = document.querySelector('#qr-reader video') as HTMLVideoElement;
    if (videoElement) {
      videoElement.style.transform = `scale(${newZoom})`;
      console.log('🔎 Zoom ajustado para:', newZoom + 'x');
      
      toast({
        title: `🔍 Zoom ${newZoom}x`,
        description: "Nível de zoom ajustado",
        duration: 1500,
      });
    }
  };

  const isValidNFCeUrl = (url: string): boolean => {
    if (!url || typeof url !== 'string') return false;
    
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.toLowerCase();
      
      const isSefazDomain = hostname.includes('sefaz') || 
                           hostname.includes('fazenda') ||
                           hostname.includes('nfce') ||
                           hostname.includes('nfe');
      
      const hasNFCeParams = urlObj.searchParams.has('chNFe') || 
                           urlObj.searchParams.has('p') ||
                           urlObj.searchParams.has('tpAmb');
      
      return isSefazDomain && hasNFCeParams;
    } catch {
      return false;
    }
  };

  const startNativeScanner = async () => {
    try {
      console.log('🔍 Iniciando Google ML Kit Scanner nativo...');
      setIsScanning(true);

      toast({
        title: "📱 Abrindo Scanner ML Kit",
        description: "Aponte para o QR Code da NFCe",
        duration: 2000,
      });

      const result = await MLKitScanner.scanBarcode();

      setIsScanning(false);

      if (result.ScanResult) {
        const code = result.ScanResult;
        console.log('🎯 QR Code detectado com ML Kit:', code);

        if (isValidNFCeUrl(code)) {
          console.log('✅ NFCe válida detectada com ML Kit!');
          toast({
            title: "✅ NFCe Detectada!",
            description: "Processando nota fiscal...",
            duration: 2000,
          });
          onScanSuccess(code);
          onClose();
        } else {
          console.log('⚠️ QR Code detectado mas não é NFCe válida');
          toast({
            title: "⚠️ QR Code Inválido",
            description: "Este não é um QR Code de NFCe",
            variant: "destructive",
          });
        }
      } else {
        console.log('ℹ️ Scanner fechado sem detectar código');
        toast({
          title: "Scanner Cancelado",
          description: "Nenhum código foi detectado",
        });
      }
    } catch (error: any) {
      console.error('❌ Erro no scanner ML Kit:', error);
      setIsScanning(false);
      
      if (error?.message?.includes('cancel') || error?.message?.includes('User cancelled')) {
        console.log('ℹ️ Usuário cancelou o scanner');
        return;
      }
      
      toast({
        title: "Erro no Scanner",
        description: "Falha ao escanear. Tente novamente.",
        variant: "destructive"
      });
    }
  };


  if (!isOpen) return null;

  // Para Android/iOS, o scanner abre em tela cheia nativamente
  // então apenas mostramos mensagem enquanto aguarda
  if (useNativeScanner) {
    return (
      <div className="fixed inset-0 z-[9999] bg-background/95 backdrop-blur-sm flex items-center justify-center">
        <div className="bg-card p-8 rounded-lg shadow-lg max-w-sm mx-4 text-center space-y-4">
          <div className="text-6xl mb-4">📱</div>
          <h2 className="text-2xl font-bold">Preparando Scanner ML Kit</h2>
          <p className="text-muted-foreground">
            Scanner nativo Google ML Kit abrirá em tela cheia
          </p>
          <p className="text-sm text-muted-foreground">
            Com detecção de cantos (4 pontos amarelos) e autofocus contínuo
          </p>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
        </div>
      </div>
    );
  }

  // Scanner web (navegador)
  return (
    <div className="fixed inset-0 z-[9999] bg-black">
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between p-4 bg-black/90 backdrop-blur-sm border-b border-white/10">
          <h2 className="text-lg font-semibold text-white">Escanear QR Code NFCe</h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="text-white hover:bg-white/10"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Scanner Container */}
        <div className="flex-1 relative">
          <div 
            id="qr-reader" 
            ref={scannerContainerRef}
            className="w-full h-full"
          />

          {/* Custom Overlay com Cantos Destacados */}
          {scannerReady && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              {/* Escurecimento das bordas */}
              <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-transparent to-black/70" />
              <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-transparent to-black/70" />

              {/* Frame de detecção com animação */}
              <div className="relative w-80 h-80 animate-pulse">
                {/* Quadrado principal */}
                <div className="absolute inset-0 border-2 border-white/30 rounded-2xl" />

                {/* 4 Cantos Destacados (simulando ML Kit) */}
                {/* Canto Superior Esquerdo */}
                <div className="absolute -top-1 -left-1 w-16 h-16">
                  <div className="absolute top-0 left-0 w-full h-1 bg-yellow-400 rounded-full shadow-[0_0_10px_rgba(250,204,21,0.8)]" />
                  <div className="absolute top-0 left-0 w-1 h-full bg-yellow-400 rounded-full shadow-[0_0_10px_rgba(250,204,21,0.8)]" />
                  <div className="absolute top-0 left-0 w-3 h-3 bg-yellow-400 rounded-full shadow-[0_0_15px_rgba(250,204,21,1)] animate-ping" />
                </div>

                {/* Canto Superior Direito */}
                <div className="absolute -top-1 -right-1 w-16 h-16">
                  <div className="absolute top-0 right-0 w-full h-1 bg-yellow-400 rounded-full shadow-[0_0_10px_rgba(250,204,21,0.8)]" />
                  <div className="absolute top-0 right-0 w-1 h-full bg-yellow-400 rounded-full shadow-[0_0_10px_rgba(250,204,21,0.8)]" />
                  <div className="absolute top-0 right-0 w-3 h-3 bg-yellow-400 rounded-full shadow-[0_0_15px_rgba(250,204,21,1)] animate-ping" />
                </div>

                {/* Canto Inferior Esquerdo */}
                <div className="absolute -bottom-1 -left-1 w-16 h-16">
                  <div className="absolute bottom-0 left-0 w-full h-1 bg-yellow-400 rounded-full shadow-[0_0_10px_rgba(250,204,21,0.8)]" />
                  <div className="absolute bottom-0 left-0 w-1 h-full bg-yellow-400 rounded-full shadow-[0_0_10px_rgba(250,204,21,0.8)]" />
                  <div className="absolute bottom-0 left-0 w-3 h-3 bg-yellow-400 rounded-full shadow-[0_0_15px_rgba(250,204,21,1)] animate-ping" />
                </div>

                {/* Canto Inferior Direito */}
                <div className="absolute -bottom-1 -right-1 w-16 h-16">
                  <div className="absolute bottom-0 right-0 w-full h-1 bg-yellow-400 rounded-full shadow-[0_0_10px_rgba(250,204,21,0.8)]" />
                  <div className="absolute bottom-0 right-0 w-1 h-full bg-yellow-400 rounded-full shadow-[0_0_10px_rgba(250,204,21,0.8)]" />
                  <div className="absolute bottom-0 right-0 w-3 h-3 bg-yellow-400 rounded-full shadow-[0_0_15px_rgba(250,204,21,1)] animate-ping" />
                </div>

                {/* Texto de Status */}
                <div className="absolute -bottom-16 left-1/2 -translate-x-1/2 text-center">
                  <p className="text-white text-sm font-medium bg-black/60 px-4 py-2 rounded-full backdrop-blur-sm">
                    🔍 Procurando QR Code...
                  </p>
                </div>
              </div>

              {/* ✨ ETAPA 2: 4 Pontinhos Amarelos Piscando (estilo Mood) */}
              {isDetecting && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="relative w-32 h-32">
                    {/* Pontinho 1 - Superior Esquerdo */}
                    <div className="absolute top-0 left-0 w-6 h-6 bg-yellow-400 rounded-full shadow-[0_0_30px_rgba(250,204,21,1)] animate-pulse" />
                    
                    {/* Pontinho 2 - Superior Direito */}
                    <div className="absolute top-0 right-0 w-6 h-6 bg-yellow-400 rounded-full shadow-[0_0_30px_rgba(250,204,21,1)] animate-pulse" style={{ animationDelay: '0.15s' }} />
                    
                    {/* Pontinho 3 - Inferior Esquerdo */}
                    <div className="absolute bottom-0 left-0 w-6 h-6 bg-yellow-400 rounded-full shadow-[0_0_30px_rgba(250,204,21,1)] animate-pulse" style={{ animationDelay: '0.3s' }} />
                    
                    {/* Pontinho 4 - Inferior Direito */}
                    <div className="absolute bottom-0 right-0 w-6 h-6 bg-yellow-400 rounded-full shadow-[0_0_30px_rgba(250,204,21,1)] animate-pulse" style={{ animationDelay: '0.45s' }} />

                    {/* Texto "LENDO AGORA" */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 mt-20">
                      <p className="text-yellow-400 text-lg font-bold animate-pulse text-center whitespace-nowrap">
                        📱 LENDO AGORA...
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer com instruções, zoom e troubleshooting */}
        <div className="p-4 bg-black/90 backdrop-blur-sm border-t border-white/10 space-y-3">
          {/* Controles de Zoom */}
          <div className="flex items-center justify-center gap-3 mb-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => adjustZoom(-0.5)}
              disabled={zoomLevel <= 1}
              className="bg-white/10 border-white/20 text-white hover:bg-white/20 disabled:opacity-30"
            >
              <span className="text-lg">−</span>
            </Button>
            <span className="text-white text-sm font-medium px-3 py-1 bg-white/10 rounded-full">
              Zoom: {zoomLevel.toFixed(1)}x
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => adjustZoom(0.5)}
              disabled={zoomLevel >= 3}
              className="bg-white/10 border-white/20 text-white hover:bg-white/20 disabled:opacity-30"
            >
              <span className="text-lg">+</span>
            </Button>
          </div>

          <p className="text-sm text-white/80 text-center">
            Posicione o QR Code da NFCe dentro da área marcada
          </p>
          
          {!showTroubleshooting ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowTroubleshooting(true)}
              className="w-full text-yellow-400 hover:bg-white/5"
            >
              <AlertCircle className="h-4 w-4 mr-2" />
              Não está lendo? Clique aqui
            </Button>
          ) : (
            <div className="bg-white/10 rounded-lg p-3 space-y-2 text-xs text-white/90">
              <p className="font-semibold text-yellow-400 flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                Dicas para melhorar a leitura:
              </p>
              <ul className="space-y-1 list-disc list-inside">
                <li>Aproxime o QR code da câmera (15-20cm)</li>
                <li>Melhore a iluminação do ambiente</li>
                <li>Deixe a câmera focar por 2-3 segundos</li>
                <li>Evite reflexos e sombras no papel</li>
                <li>Deixe o papel o mais plano possível</li>
              </ul>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowTroubleshooting(false)}
                className="w-full mt-2 text-white/60 hover:bg-white/5"
              >
                Fechar dicas
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default QRCodeScanner;
