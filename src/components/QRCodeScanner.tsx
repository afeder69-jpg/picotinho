import { useEffect, useRef, useState } from "react";
import { Html5QrcodeScanner } from "html5-qrcode";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { X, Camera } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface QRCodeScannerProps {
  onScanSuccess: (result: string) => void;
  onClose: () => void;
  isOpen: boolean;
}

const QRCodeScanner = ({ onScanSuccess, onClose, isOpen }: QRCodeScannerProps) => {
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  useEffect(() => {
    if (isOpen && !scannerRef.current) {
      startScanner();
    } else if (!isOpen && scannerRef.current) {
      stopScanner();
    }

    return () => {
      if (scannerRef.current) {
        stopScanner();
      }
    };
  }, [isOpen]);

  const startScanner = () => {
    try {
      const scanner = new Html5QrcodeScanner(
        "qr-reader",
        {
          fps: 10,
          qrbox: { width: 280, height: 280 },
          aspectRatio: 1.0,
          showTorchButtonIfSupported: true,
          supportedScanTypes: [], // Remove file support, camera only
          rememberLastUsedCamera: true,
          showZoomSliderIfSupported: true,
          defaultZoomValueIfSupported: 2,
          // Força apenas câmera
          disableFlip: false,
          // Configuração para câmera traseira
          videoConstraints: {
            facingMode: "environment"
          }
        },
        false
      );

      scanner.render(
        (decodedText) => {
          // Success callback
          console.log("QR Code detectado:", decodedText);
          onScanSuccess(decodedText);
          stopScanner();
          onClose();
        },
        (error) => {
          // Error callback - ignoramos erros comuns quando não há QR code
          if (error.includes("NotFoundException") || 
              error.includes("No MultiFormat Readers") ||
              error.includes("NotFound")) {
            return; // Erro normal quando não há QR code na visão
          }
          console.warn("QR Scanner error:", error);
        }
      );

      scannerRef.current = scanner;
      setIsScanning(true);
      
      toast({
        title: "Câmera iniciada",
        description: "Posicione o QR Code na área de leitura",
      });
      
    } catch (error) {
      console.error("Erro ao iniciar scanner:", error);
      toast({
        title: "Erro",
        description: "Não foi possível acessar a câmera. Verifique as permissões.",
        variant: "destructive",
      });
    }
  };

  const stopScanner = () => {
    if (scannerRef.current) {
      try {
        scannerRef.current.clear();
      } catch (error) {
        console.warn("Erro ao parar scanner:", error);
      }
      scannerRef.current = null;
      setIsScanning(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-6 relative">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">Escanear QR Code</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
        
        <div className="space-y-4">
          <div className="text-center text-sm text-muted-foreground">
            Posicione o QR Code dentro da área de leitura
          </div>
          
          <div
            id="qr-reader"
            className="w-full"
            style={{ minHeight: "300px" }}
          />
          
          {!isScanning && (
            <div className="flex flex-col items-center space-y-4">
              <Camera className="w-12 h-12 text-muted-foreground" />
              <p className="text-sm text-muted-foreground text-center">
                Aguardando acesso à câmera...
              </p>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};

export default QRCodeScanner;