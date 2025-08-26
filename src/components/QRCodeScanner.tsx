import { useState, useEffect, useRef } from "react";
import { BarcodeScanner, LensFacing } from "@capacitor-mlkit/barcode-scanning";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { X, Camera, QrCode } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Capacitor } from "@capacitor/core";
import { Html5QrcodeScanner } from "html5-qrcode";

interface QRCodeScannerProps {
  onScanSuccess: (result: string) => void;
  onClose: () => void;
  isOpen: boolean;
}

const QRCodeScanner = ({ onScanSuccess, onClose, isOpen }: QRCodeScannerProps) => {
  const [isScanning, setIsScanning] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);
  const isNative = Capacitor.isNativePlatform();

  useEffect(() => {
    if (isOpen) {
      checkPermissionAndStart();
    } else {
      stopScanner();
    }

    return () => {
      stopScanner();
    };
  }, [isOpen]);

  const checkPermissionAndStart = async () => {
    try {
      console.log("Verificando permissões...", { isNative });
      
      if (isNative) {
        const status = await BarcodeScanner.requestPermissions();
        if (status.camera === "granted") {
          setHasPermission(true);
          startNativeScanner();
        } else {
          toast({
            title: "Permissão negada",
            description: "Ative a permissão da câmera para escanear QR Codes",
            variant: "destructive",
          });
          onClose();
        }
      } else {
        console.log("Plataforma web detectada, iniciando scanner web...");
        setHasPermission(true);
        startWebScanner();
      }
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

  const startNativeScanner = async () => {
    try {
      setIsScanning(true);

      await BarcodeScanner.addListener("barcodeScanned", (result) => {
        if (result?.barcode?.rawValue) {
          console.log("QR Code escaneado:", result.barcode.rawValue);
          onScanSuccess(result.barcode.rawValue);
          stopScanner();
        }
      });

      await BarcodeScanner.startScan({
        formats: [], // vazio = todos os formatos
        lensFacing: LensFacing.Back,
      });

    } catch (error) {
      console.error("Erro ao escanear:", error);
      toast({
        title: "Erro ao escanear",
        description: "Não foi possível ler o QR Code",
        variant: "destructive",
      });
      stopScanner();
    }
  };

  const startWebScanner = () => {
    try {
      setIsScanning(true);
      console.log("Iniciando scanner web...");
      
      setTimeout(() => {
        const element = document.getElementById("qr-reader");
        if (element) {
          console.log("Elemento encontrado, criando scanner...");
          scannerRef.current = new Html5QrcodeScanner(
            "qr-reader",
            { 
              fps: 10, 
              qrbox: { width: 250, height: 250 },
              aspectRatio: 1.0
            },
            false
          );

          scannerRef.current.render(
            (decodedText) => {
              console.log("QR Code escaneado:", decodedText);
              onScanSuccess(decodedText);
              stopScanner();
            },
            (error) => {
              // Não logar erros comuns do scanner
              if (!error.includes("QR code parse error")) {
                console.debug("Scanner error:", error);
              }
            }
          );
        } else {
          console.error("Elemento qr-reader não encontrado");
        }
      }, 200);
    } catch (error) {
      console.error("Erro ao escanear:", error);
      toast({
        title: "Erro ao escanear",
        description: "Não foi possível ler o QR Code",
        variant: "destructive",
      });
      stopScanner();
    }
  };

  const stopScanner = async () => {
    try {
      if (isNative) {
        await BarcodeScanner.stopScan();
        BarcodeScanner.removeAllListeners();
      } else {
        if (scannerRef.current) {
          scannerRef.current.clear();
          scannerRef.current = null;
        }
      }
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

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-6 relative">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">Escanear QR Code</h2>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleClose}
            className="bg-yellow-400 hover:bg-yellow-500 text-yellow-900 rounded-full w-8 h-8 p-0"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {isScanning ? (
          isNative ? (
            <div className="text-center">
              <QrCode className="w-8 h-8 mx-auto mb-2 text-primary animate-pulse" />
              <p className="text-sm">Posicione o QR Code na frente da câmera</p>
            </div>
          ) : (
            <div id="qr-reader" className="w-full"></div>
          )
        ) : (
          <div className="flex flex-col items-center space-y-4">
            <Camera className="w-12 h-12 text-muted-foreground animate-pulse" />
            <p className="text-sm text-muted-foreground text-center">
              {hasPermission ? "Iniciando câmera..." : "Verificando permissões..."}
            </p>
          </div>
        )}
      </Card>
    </div>
  );
};

export default QRCodeScanner;


