import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Button } from './ui/button';
import { toast } from '@/hooks/use-toast';
import { X } from 'lucide-react';

interface QRCodeScannerWebProps {
  onScanSuccess: (data: string) => void;
  onClose: () => void;
}

const QRCodeScannerWeb = ({ onScanSuccess, onClose }: QRCodeScannerWebProps) => {
  const [isScanning, setIsScanning] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const qrCodeRegionId = "qr-reader";

  useEffect(() => {
    startScanner();
    return () => {
      stopScanner();
    };
  }, []);

  const startScanner = async () => {
    try {
      setIsScanning(true);
      
      const html5QrCode = new Html5Qrcode(qrCodeRegionId);
      scannerRef.current = html5QrCode;

      await html5QrCode.start(
        { facingMode: "environment" }, // Câmera traseira
        {
          fps: 10,
          qrbox: { width: 250, height: 250 }
        },
        (decodedText) => {
          toast({
            title: "QR Code detectado",
            description: "Processando informações...",
          });
          
          onScanSuccess(decodedText);
          stopScanner();
        },
        (errorMessage) => {
          // Ignora erros de "not found" durante scan contínuo
          console.debug('Scanner:', errorMessage);
        }
      );
    } catch (error) {
      console.error('Erro ao iniciar scanner:', error);
      
      toast({
        title: "Erro ao acessar câmera",
        description: "Verifique as permissões e tente novamente.",
        variant: "destructive"
      });
      
      onClose();
    }
  };

  const stopScanner = async () => {
    try {
      if (scannerRef.current) {
        await scannerRef.current.stop();
        scannerRef.current.clear();
        scannerRef.current = null;
      }
      setIsScanning(false);
      onClose();
    } catch (error) {
      console.error('Erro ao parar scanner:', error);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-between p-6 bg-black">
      {/* Botão de fechar */}
      <div className="relative z-10 w-full flex justify-end mb-4">
        <Button
          variant="destructive"
          size="lg"
          className="rounded-full shadow-lg"
          onClick={stopScanner}
        >
          <X className="w-6 h-6" />
          <span className="ml-2">Cancelar</span>
        </Button>
      </div>

      {/* Container do Scanner */}
      <div className="flex-1 flex flex-col items-center justify-center w-full max-w-md">
        <div id={qrCodeRegionId} className="w-full rounded-lg overflow-hidden shadow-2xl" />
        
        {/* Instruções */}
        {isScanning && (
          <div className="mt-6 bg-background/90 backdrop-blur-sm p-6 rounded-lg shadow-lg text-center">
            <p className="text-lg font-semibold">Aponte para o QR Code da nota fiscal</p>
            <p className="text-sm text-muted-foreground mt-2">
              O scanner detectará automaticamente
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default QRCodeScannerWeb;
