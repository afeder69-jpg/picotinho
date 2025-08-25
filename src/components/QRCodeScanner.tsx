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

  useEffect(() => {
    console.log("QRCodeScanner - isOpen mudou:", isOpen);
    console.log("QRCodeScanner - Plataforma nativa:", Capacitor.isNativePlatform());
    
    if (isOpen && Capacitor.isNativePlatform()) {
      console.log("QRCodeScanner - Iniciando scanner nativo...");
      startScanner();
    }
  }, [isOpen]);

  const startScanner = async () => {
    console.log("startScanner - INÍCIO");
    
    try {
      setIsScanning(true);
      console.log("startScanner - Tentando importar plugin...");
      
      const { BarcodeScanner } = await import("@capacitor-mlkit/barcode-scanning");
      console.log("startScanner - Plugin importado com sucesso");
      
      console.log("startScanner - Iniciando scan...");
      const result = await BarcodeScanner.scan();
      console.log("startScanner - Resultado:", result);
      
      if (result.barcodes && result.barcodes.length > 0) {
        const qrContent = result.barcodes[0].rawValue;
        console.log("startScanner - QR detectado:", qrContent);
        onScanSuccess(qrContent);
        onClose();
      }
      
    } catch (error) {
      console.error("startScanner - ERRO:", error);
      console.error("startScanner - Tipo do erro:", typeof error);
      console.error("startScanner - Message:", error?.message);
      
      toast({
        title: "Erro na câmera",
        description: error?.message || "Erro desconhecido",
        variant: "destructive",
      });
      onClose();
    } finally {
      setIsScanning(false);
    }
  };

  const handleManualInput = () => {
    const input = prompt("Digite o código QR:");
    if (input?.trim()) {
      onScanSuccess(input.trim());
      onClose();
    }
  };

  console.log("QRCodeScanner - Renderizando, isOpen:", isOpen);

  if (!isOpen) {
    console.log("QRCodeScanner - Não renderizando (isOpen = false)");
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">Escanear QR Code</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
        
        <div className="space-y-4">
          <div className="flex flex-col items-center space-y-4">
            <Camera className="w-12 h-12 text-muted-foreground animate-pulse" />
            <p className="text-sm text-muted-foreground text-center">
              {isScanning ? "Escaneando..." : "Preparando câmera..."}
            </p>
          </div>
          
          <Button 
            onClick={handleManualInput}
            variant="outline" 
            className="w-full"
          >
            Digite o código manualmente
          </Button>
          
          <div className="text-center text-xs text-muted-foreground">
            {Capacitor.isNativePlatform() ? "Modo nativo ativo" : "Modo navegador"}
          </div>
        </div>
      </Card>
    </div>
  );
};

export default QRCodeScanner;
