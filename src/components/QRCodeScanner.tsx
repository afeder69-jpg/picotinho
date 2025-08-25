import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { X, Camera } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Capacitor } from "@capacitor/core";
import { BarcodeScanner, BarcodeFormat } from "@capacitor-mlkit/barcode-scanning";

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
      console.log("🔍 Iniciando scanner...");

      // Verifica se está na plataforma nativa
      if (!Capacitor.isNativePlatform()) {
        throw new Error("Scanner QR só funciona em dispositivos móveis");
      }

      // 🔑 1. Verifica se o plugin está disponível
      const available = await BarcodeScanner.isSupported();
      console.log("📱 Scanner disponível:", available);
      
      if (!available.supported) {
        throw new Error("Scanner QR não suportado neste dispositivo");
      }

      // 🔑 2. Solicita permissão antes de abrir
      const perm = await BarcodeScanner.requestPermissions();
      console.log("🔑 Permissão da câmera:", perm);

      if (perm.camera === "granted") {
        console.log("✅ Permissão concedida, iniciando scan...");
        
        // 🔑 3. Inicia o scanner com configurações específicas
        const result = await BarcodeScanner.scan({
          formats: [
            BarcodeFormat.QrCode,
            BarcodeFormat.DataMatrix,
            BarcodeFormat.Pdf417,
            BarcodeFormat.Aztec
          ]
        });
        console.log("📱 Resultado do scan:", result);

        if (result.barcodes && result.barcodes.length > 0) {
          const qrContent = result.barcodes[0].rawValue;
          console.log("✅ QR Code encontrado:", qrContent);
          toast({
            title: "QR Code detectado!",
            description: `Conteúdo: ${qrContent.substring(0, 50)}...`,
          });
          onScanSuccess(qrContent);
          onClose();
        } else {
          console.log("❌ Nenhum código encontrado");
          toast({
            title: "Nenhum código encontrado",
            description: "Tente posicionar melhor o QR Code",
            variant: "destructive",
          });
          onClose();
        }
      } else if (perm.camera === "denied") {
        console.log("❌ Permissão negada:", perm);
        toast({
          title: "Permissão negada",
          description: "Você precisa permitir o acesso à câmera nas configurações do app",
          variant: "destructive",
        });
        onClose();
      } else {
        console.log("❌ Permissão não concedida:", perm);
        toast({
          title: "Erro na câmera",
          description: "Não foi possível acessar a câmera",
          variant: "destructive",
        });
        onClose();
      }
    } catch (error: any) {
      console.error("💥 Erro ao escanear:", error);
      console.error("💥 Error details:", {
        message: error?.message,
        code: error?.code,
        stack: error?.stack
      });
      
      let errorMessage = "Erro desconhecido";
      if (error?.message?.includes("não suportado")) {
        errorMessage = "Scanner QR não suportado neste dispositivo";
      } else if (error?.message?.includes("dispositivos móveis")) {
        errorMessage = "Scanner QR só funciona em dispositivos móveis";
      } else if (error?.message) {
        errorMessage = error.message;
      }
      
      toast({
        title: "Erro na câmera",
        description: errorMessage,
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