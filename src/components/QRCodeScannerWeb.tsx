import { useState, useEffect } from 'react';
import { Scanner } from '@yudiel/react-qr-scanner';
import { Button } from './ui/button';
import { toast } from '@/hooks/use-toast';
import { X, Flashlight, FlashlightOff } from 'lucide-react';

interface QRCodeScannerWebProps {
  onScanSuccess: (data: string) => void;
  onClose: () => void;
}

const QRCodeScannerWeb = ({ onScanSuccess, onClose }: QRCodeScannerWebProps) => {
  const [isScanning, setIsScanning] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [scanAttempts, setScanAttempts] = useState(0);

  useEffect(() => {
    // Feedback háptico ao montar
    if (navigator.vibrate) {
      navigator.vibrate(50);
    }

    // Verificar permissões de câmera
    const checkCameraPermissions = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        console.log('✅ [CAMERA] Permissões concedidas');
        stream.getTracks().forEach(track => track.stop());
      } catch (error) {
        console.error('❌ [CAMERA] Erro ao acessar câmera:', error);
        toast({
          title: "Erro de permissão",
          description: "Permita o acesso à câmera para escanear QR Codes",
          variant: "destructive"
        });
      }
    };
    
    checkCameraPermissions();
  }, []);

  const handleScan = (result: any) => {
    console.log('🔍 [SCANNER DEBUG] handleScan chamado');
    console.log('📦 [SCANNER DEBUG] result completo:', JSON.stringify(result, null, 2));
    console.log('📦 [SCANNER DEBUG] result type:', typeof result);
    console.log('📦 [SCANNER DEBUG] result[0]:', result?.[0]);
    console.log('📦 [SCANNER DEBUG] rawValue:', result?.[0]?.rawValue);

    if (isProcessing) {
      console.log('⏸️ [SCANNER] Já processando, ignorando nova detecção');
      return;
    }

    if (!result || !result[0]?.rawValue) {
      console.warn('⚠️ [SCANNER] Resultado vazio ou inválido - retornando sem processar');
      return;
    }

    setIsProcessing(true);
    setIsScanning(false);

    const qrData = result[0].rawValue;
    console.log('✅ [SCANNER] QR detectado com sucesso:', qrData);

    // Feedback háptico de sucesso
    if (navigator.vibrate) {
      navigator.vibrate([100, 50, 100]);
    }

    toast({
      title: "✅ QR Code detectado",
      description: "Processando nota fiscal...",
    });

    // Chamar callback após pequeno delay para garantir processamento
    setTimeout(() => {
      onScanSuccess(qrData);
    }, 100);
  };

  const handleError = (error: Error) => {
    console.error('Scanner error:', error);
    setScanAttempts(prev => prev + 1);
    
    // Só mostrar erro após múltiplas tentativas
    if (scanAttempts > 5) {
      toast({
        title: "Erro ao acessar câmera",
        description: "Verifique as permissões e tente novamente.",
        variant: "destructive"
      });
    }
  };

  const toggleTorch = () => {
    setTorchEnabled(!torchEnabled);
  };

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col bg-black">
      {/* Header com controles */}
      <div className="relative z-10 w-full flex justify-between items-center p-4 bg-black/80 backdrop-blur-sm">
        <Button
          variant="outline"
          size="lg"
          className="rounded-full"
          onClick={toggleTorch}
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
          onClick={onClose}
        >
          <X className="w-6 h-6" />
          <span className="ml-2">Cancelar</span>
        </Button>
      </div>

      {/* Scanner Container */}
      <div className="flex-1 flex flex-col items-center justify-center relative overflow-hidden">
        {isScanning && (
          <>
            {/* Scanner Component */}
            <div className="w-full h-full relative">
              <Scanner
                onScan={handleScan}
                onError={handleError}
                constraints={{
                  facingMode: 'environment',
                  aspectRatio: 1,
                }}
                formats={[
                  'qr_code',
                  'data_matrix',
                ]}
                components={{
                  finder: true,
                  zoom: true,
                  torch: torchEnabled,
                }}
                styles={{
                  container: {
                    width: '100%',
                    height: '100%',
                    position: 'relative',
                  },
                  video: {
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                  },
                }}
                allowMultiple={false}
                scanDelay={300}
              />
            </div>

            {/* Aiming Square Animation */}
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

            {/* Instruções */}
            <div className="absolute bottom-24 left-0 right-0 px-6">
              <div className="bg-background/95 backdrop-blur-md p-6 rounded-2xl shadow-2xl border border-primary/20">
                <div className="flex items-center justify-center gap-3 mb-3">
                  <div className="w-3 h-3 bg-primary rounded-full animate-pulse" />
                  <p className="text-lg font-bold text-center">
                    Escaneando QR Code
                  </p>
                </div>
                <p className="text-sm text-muted-foreground text-center leading-relaxed">
                  Aponte a câmera para o QR Code da nota fiscal
                  <br />
                  <span className="text-xs">O scanner detectará automaticamente</span>
                </p>
              </div>
            </div>
          </>
        )}
      </div>

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
      `}</style>
    </div>
  );
};

export default QRCodeScannerWeb;
