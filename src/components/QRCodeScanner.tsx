import { useEffect, useState } from 'react';
import { BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';
import { Capacitor } from '@capacitor/core';
import { Button } from './ui/button';
import { toast } from '@/hooks/use-toast';
import { X } from 'lucide-react';

interface QRCodeScannerProps {
  onScanSuccess: (data: string) => void;
  onClose: () => void;
}

const QRCodeScanner = ({ onScanSuccess, onClose }: QRCodeScannerProps) => {
  const [isScanning, setIsScanning] = useState(false);

  useEffect(() => {
    // Verificar se está em plataforma nativa
    if (!Capacitor.isNativePlatform()) {
      toast({
        title: "Scanner não disponível",
        description: "O scanner QR está disponível apenas no aplicativo móvel",
        variant: "destructive"
      });
      onClose();
      return;
    }

    startScan();

    // Cleanup ao desmontar componente
    return () => {
      stopScan();
    };
  }, []);

  const startScan = async () => {
    try {
      // Solicitar permissões de câmera
      const { camera } = await BarcodeScanner.requestPermissions();
      
      if (camera !== 'granted') {
        toast({
          title: "Permissão negada",
          description: "É necessário permitir o acesso à câmera para usar o scanner",
          variant: "destructive"
        });
        onClose();
        return;
      }

      document.body.classList.add('scanner-active');
      
      setIsScanning(true);

      // Iniciar scanner
      const result = await BarcodeScanner.scan();
      
      if (result.barcodes && result.barcodes.length > 0) {
        const scannedData = result.barcodes[0].rawValue;
        
        toast({
          title: "QR Code detectado",
          description: "Processando informações...",
        });
        
        onScanSuccess(scannedData);
      }
      
      await stopScan();
      
    } catch (error) {
      console.error('Erro ao escanear:', error);
      
      toast({
        title: "Erro no scanner",
        description: "Não foi possível iniciar o scanner. Tente novamente.",
        variant: "destructive"
      });
      
      await stopScan();
    }
  };

  const stopScan = async () => {
    try {
      setIsScanning(false);
      document.body.classList.remove('scanner-active');
      await BarcodeScanner.stopScan();
      onClose();
    } catch (error) {
      console.error('Erro ao parar scanner:', error);
      onClose();
    }
  };

  if (!Capacitor.isNativePlatform()) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-between p-6 bg-transparent">
      {/* Overlay para fechar */}
      <div className="absolute inset-0 bg-black/50" onClick={stopScan} />
      
      {/* Botão de fechar */}
      <div className="relative z-10 w-full flex justify-end">
        <Button
          variant="destructive"
          size="lg"
          className="rounded-full shadow-lg"
          onClick={stopScan}
        >
          <X className="w-6 h-6" />
          <span className="ml-2">Cancelar</span>
        </Button>
      </div>

      {/* Instruções */}
      {isScanning && (
        <div className="relative z-10 bg-background/90 backdrop-blur-sm p-6 rounded-lg shadow-lg text-center">
          <p className="text-lg font-semibold">Aponte a câmera para o QR Code</p>
          <p className="text-sm text-muted-foreground mt-2">
            O scanner detectará automaticamente o código
          </p>
        </div>
      )}
    </div>
  );
};

export default QRCodeScanner;
