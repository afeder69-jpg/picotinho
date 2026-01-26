import { useState, useEffect, useRef } from 'react';
import { Scanner } from '@yudiel/react-qr-scanner';
import { Button } from './ui/button';
import { toast } from '@/hooks/use-toast';
import { X, Flashlight, FlashlightOff, Camera, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface QRCodeScannerWebProps {
  onScanSuccess: (data: string) => void;
  onClose: () => void;
}

const QRCodeScannerWeb = ({ onScanSuccess, onClose }: QRCodeScannerWebProps) => {
  const [isScanning, setIsScanning] = useState(true);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [scanAttempts, setScanAttempts] = useState(0);
  const [isProcessingPhoto, setIsProcessingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Feedback háptico ao montar
    if (navigator.vibrate) {
      navigator.vibrate(50);
    }
  }, []);

  const handleScan = (result: any) => {
    if (!result || !result[0]?.rawValue) return;

    const qrData = result[0].rawValue;
    console.log('🔍 [WEB SCANNER OPTIMIZED] QR detectado:', qrData);

    // Feedback háptico de sucesso
    if (navigator.vibrate) {
      navigator.vibrate([100, 50, 100]);
    }

    toast({
      title: "✅ QR Code detectado",
      description: "Processando nota fiscal...",
    });

    setIsScanning(false);
    onScanSuccess(qrData);
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

  const handlePhotoCapture = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsProcessingPhoto(true);

    try {
      // Converter arquivo para base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      console.log('📸 [WEB SCANNER] Enviando foto para extração de URL...');

      toast({
        title: "🔍 Analisando foto...",
        description: "Procurando URL na imagem...",
      });

      // Chamar edge function para extrair URL
      const { data, error } = await supabase.functions.invoke('extract-url-from-photo', {
        body: { image_base64: base64 }
      });

      if (error) {
        throw new Error(error.message);
      }

      if (!data?.success) {
        toast({
          title: "❌ URL não encontrada",
          description: data?.error || "Não foi possível extrair a URL da imagem. Tente tirar uma foto mais nítida.",
          variant: "destructive"
        });
        return;
      }

      console.log('✅ [WEB SCANNER] URL extraída:', data.url);

      // Feedback háptico de sucesso
      if (navigator.vibrate) {
        navigator.vibrate([100, 50, 100]);
      }

      toast({
        title: "✅ URL detectada",
        description: "Processando nota fiscal...",
      });

      setIsScanning(false);
      onScanSuccess(data.url);

    } catch (error) {
      console.error('❌ [WEB SCANNER] Erro ao processar foto:', error);
      toast({
        title: "Erro ao processar foto",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive"
      });
    } finally {
      setIsProcessingPhoto(false);
      // Limpar input para permitir selecionar a mesma foto novamente
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col bg-black">
      {/* Input oculto para captura de foto */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
      />

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
        {isScanning && !isProcessingPhoto && (
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
          </>
        )}

        {/* Loading state para processamento de foto */}
        {isProcessingPhoto && (
          <div className="flex flex-col items-center justify-center gap-4">
            <Loader2 className="w-16 h-16 text-primary animate-spin" />
            <p className="text-white text-lg font-semibold">Analisando foto...</p>
            <p className="text-white/70 text-sm">Procurando URL na imagem</p>
          </div>
        )}

        {/* Instruções */}
        {isScanning && !isProcessingPhoto && (
          <div className="absolute bottom-6 left-0 right-0 px-6">
            <div className="bg-background/95 backdrop-blur-md p-6 rounded-2xl shadow-2xl border border-primary/20">
              <div className="flex items-center justify-center gap-3 mb-3">
                <div className="w-3 h-3 bg-primary rounded-full animate-pulse" />
                <p className="text-lg font-bold text-center">
                  Escaneando QR Code
                </p>
              </div>
              <p className="text-sm text-muted-foreground text-center leading-relaxed mb-4">
                Aponte a câmera para o QR Code da nota fiscal
              </p>

              {/* Separador */}
              <div className="flex items-center gap-3 my-4">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground">ou</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              {/* Botão para tirar foto da URL */}
              <Button
                variant="outline"
                className="w-full flex items-center justify-center gap-2"
                onClick={handlePhotoCapture}
                disabled={isProcessingPhoto}
              >
                <Camera className="w-5 h-5" />
                <span>Tirar Foto da URL</span>
              </Button>
              <p className="text-xs text-muted-foreground text-center mt-2">
                Sem QR Code no cupom? Tire uma foto da URL impressa
              </p>
            </div>
          </div>
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
