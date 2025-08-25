import { useState, useEffect } from "react";
import { BarcodeScanner, BarcodeFormat } from "@capacitor-mlkit/barcode-scanning";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { X, Camera, QrCode } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Capacitor } from "@capacitor/core";

interface QRCodeScannerProps {
  onScanSuccess: (result: string) => void;
  onClose: () => void;
  isOpen: boolean;
}

const QRCodeScanner = ({ onScanSuccess, onClose, isOpen }: QRCodeScannerProps) => {
  const [isScanning, setIsScanning] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);

  useEffect(() => {
    if (isOpen) {
      checkPermissionAndStart();
    } else if (isScanning) {
      stopScanner();
    }

    return () => {
      if (isScanning) {
        stopScanner();
      }
    };
  }, [isOpen]);

  const checkPermissionAndStart = async () => {
    try {
      // Verifica se estamos em um ambiente nativo
      if (!Capacitor.isNativePlatform()) {
        toast({
          title: "Funcionalidade indisponível",
          description: "O scanner QR funciona apenas no app instalado",
          variant: "destructive",
        });
        onClose();
        return;
      }

      // Solicita permissão de câmera
      await BarcodeScanner.requestPermissions();
      setHasPermission(true);
      startScanner();
    } catch (error) {
      console.error("Erro ao verificar permissão:", error);
      toast({
        title: "Erro",
        description: "Não foi possível acessar a câmera",
        variant: "destructive",
      });
      onClose();
    }
  };

  const startScanner = async () => {
    try {
      setIsScanning(true);
      
      // Esconde o background do app para mostrar a câmera
      document.body.style.background = "transparent";
      
      const listener = await BarcodeScanner.addListener('barcodeScanned', async (result) => {
        console.log("QR Code detectado:", result);
        
        if (result.barcode && result.barcode.rawValue) {
          onScanSuccess(result.barcode.rawValue);
          
          toast({
            title: "QR Code detectado!",
            description: "Processando informações...",
          });
          
          await stopScanner();
          listener.remove();
          onClose();
        }
      });
      
      await BarcodeScanner.startScan({
        formats: [BarcodeFormat.QrCode]
      });
      
    } catch (error) {
      console.error("Erro ao escanear:", error);
      toast({
        title: "Erro ao escanear",
        description: "Não foi possível ler o QR Code",
        variant: "destructive",
      });
      await stopScanner();
    }
  };

  const stopScanner = async () => {
    try {
      await BarcodeScanner.stopScan();
      document.body.style.background = "";
      setIsScanning(false);
    } catch (error) {
      console.warn("Erro ao parar scanner:", error);
      setIsScanning(false);
    }
  };

  const handleClose = () => {
    stopScanner();
    onClose();
  };

  if (!isOpen) return null;

  // Se estiver escaneando, mostra overlay mínimo
  if (isScanning) {
    return (
      <div className="fixed inset-0 bg-transparent z-50 flex flex-col justify-between p-6">
        <div className="flex justify-between items-center">
          <div className="bg-background/90 backdrop-blur-sm rounded-lg p-3">
            <h2 className="text-lg font-semibold text-foreground">Escaneando QR Code</h2>
          </div>
          <Button 
            variant="secondary" 
            size="sm" 
            onClick={handleClose}
            className="bg-background/90 backdrop-blur-sm"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
        
        <div className="text-center">
          <div className="bg-background/90 backdrop-blur-sm rounded-lg p-4 mx-auto max-w-sm">
            <QrCode className="w-8 h-8 mx-auto mb-2 text-primary" />
            <p className="text-sm text-foreground">
              Posicione o QR Code na câmera
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Tela de preparação/carregamento
  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-6 relative">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">Escanear QR Code</h2>
          <Button variant="ghost" size="sm" onClick={handleClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
        
        <div className="space-y-4">
          <div className="flex flex-col items-center space-y-4">
            <Camera className="w-12 h-12 text-muted-foreground animate-pulse" />
            <p className="text-sm text-muted-foreground text-center">
              {hasPermission ? "Iniciando câmera..." : "Verificando permissões..."}
            </p>
          </div>
          
          <div className="text-center text-xs text-muted-foreground">
            A câmera traseira será aberta automaticamente
          </div>
        </div>
      </Card>
    </div>
  );
};

export default QRCodeScanner;