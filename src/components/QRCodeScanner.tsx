import { useState, useEffect } from "react";
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
  const [isNative, setIsNative] = useState(false);

  useEffect(() => {
    setIsNative(Capacitor.isNativePlatform());
  }, []);

  useEffect(() => {
    if (isOpen && isNative) {
      console.log("=== QR SCANNER ABERTO ===");
      console.log("Ambiente nativo:", isNative);
      console.log("Iniciando scanner...");
      startScanner();
    } else if (isOpen && !isNative) {
      console.log("=== MODO NAVEGADOR ===");
      // No navegador, mostrar apenas a opção manual
    }
    
    return () => {
      if (isScanning) {
        console.log("=== LIMPANDO SCANNER ===");
        cleanup();
      }
    };
  }, [isOpen]);

  const startScanner = async () => {
    try {
      console.log("1. Tentando importar BarcodeScanning...");
      const { BarcodeScanner } = await import("@capacitor-mlkit/barcode-scanning");
      
      console.log("2. Verificando permissão...");
      const permission = await BarcodeScanner.checkPermissions();
      console.log("Permissão atual:", permission);
      
      if (permission.camera !== 'granted') {
        console.log("3. Solicitando permissão...");
        const requestResult = await BarcodeScanner.requestPermissions();
        console.log("Resultado da solicitação:", requestResult);
        
        if (requestResult.camera !== 'granted') {
          toast({
            title: "Permissão necessária",
            description: "Permita o acesso à câmera nas configurações",
            variant: "destructive",
          });
          onClose();
          return;
        }
      }

      console.log("4. Verificando disponibilidade...");
      const isAvailable = await BarcodeScanner.isSupported();
      console.log("Scanner disponível:", isAvailable);
      
      if (!isAvailable.supported) {
        toast({
          title: "Scanner não suportado",
          description: "Dispositivo não suporta scanner de QR",
          variant: "destructive",
        });
        onClose();
        return;
      }

      console.log("5. Iniciando scan...");
      setIsScanning(true);
      
      const result = await BarcodeScanner.scan();
      console.log("Resultado:", result);
      
      if (result.barcodes && result.barcodes.length > 0) {
        const qrContent = result.barcodes[0].rawValue;
        console.log("6. QR detectado:", qrContent);
        onScanSuccess(qrContent);
        toast({
          title: "QR Code detectado!",
          description: "Processando...",
        });
        onClose();
      }
      
    } catch (error) {
      console.error("ERRO SCANNER:", error);
      toast({
        title: "Erro na câmera",
        description: error.message || "Não foi possível abrir a câmera",
        variant: "destructive",
      });
      onClose();
    } finally {
      setIsScanning(false);
    }
  };

  const cleanup = async () => {
    try {
      setIsScanning(false);
      // MLKit não precisa de cleanup manual como o plugin antigo
      console.log("Scanner limpo");
    } catch (error) {
      console.warn("Erro ao limpar scanner:", error);
      setIsScanning(false);
    }
  };

  const handleClose = () => {
    cleanup();
    onClose();
  };

  const handleManualInput = () => {
    const input = prompt("Digite o código QR:");
    if (input?.trim()) {
      onScanSuccess(input.trim());
      onClose();
    }
  };

  if (!isOpen) return null;

  // Scanner ativo (transparente)
  if (isScanning && isNative) {
    return (
      <div className="fixed inset-0 bg-transparent z-50 flex flex-col justify-between p-6">
        <div className="flex justify-between items-center">
          <div className="bg-background/90 backdrop-blur-sm rounded-lg p-3">
            <h2 className="text-lg font-semibold">Escaneando QR</h2>
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
            <p className="text-sm">Posicione o QR Code na câmera</p>
          </div>
        </div>
      </div>
    );
  }

  // Modo navegador ou preparação
  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-6">
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
              {isNative ? "Iniciando câmera..." : "Modo navegador - use entrada manual"}
            </p>
          </div>
          
          <Button 
            onClick={handleManualInput}
            variant="outline" 
            className="w-full"
          >
            Digite o código manualmente
          </Button>
          
          {!isNative && (
            <div className="text-center text-xs text-muted-foreground">
              Para usar a câmera, instale o app no celular
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};

export default QRCodeScanner;