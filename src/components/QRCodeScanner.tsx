import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { X, Camera } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Capacitor } from "@capacitor/core";
import { BarcodeScanner } from "@capacitor-mlkit/barcode-scanning";

interface QRCodeScannerProps {
  onScanSuccess: (result: string) => void;
  onClose: () => void;
  isOpen: boolean;
}

const QRCodeScanner = ({ onScanSuccess, onClose, isOpen }: QRCodeScannerProps) => {
  const [isScanning, setIsScanning] = useState(false);

  useEffect(() => {
    if (isOpen && Capacitor.isNativePlatform()) {
      startScanner();
    }

    return () => {
      // Garante que a câmera será liberada ao fechar
      BarcodeScanner.stopScan().catch(() => {});
    };
  }, [isOpen]);

  const startScanner = async () => {
    try {
      setIsScanning(true);

      // 🔑 1. Solicita permissão antes de abrir
      const perm = await BarcodeScanner.requestPermissions();
      console.log("Permissão da câmera:", perm);

      if (perm.camera === "granted" || perm.camera === "limited") {
        // 🔑 2. Inicia o scanner
        const result = await BarcodeScanner.scan();
        console.log("Resultado do scan:", result);

        if (result.barcodes && result.barcodes.length > 0) {
          const qrContent = result.barcodes[0].rawValue;
          onScanSuccess(qrContent);
          onClose();
        }
      } else {
        toast({
          title: "Permissão negada",
          description: "Ative a câmera para escanear o QR Code",
          variant: "destructive",
        });
        onClose();
      }
    } catch (error: any) {
      console.error("Erro ao escanear:", error);
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

  if (!isOpen) return null;

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
        </div>
      </Card>
    </div>
  );
};

export default QRCodeScanner;