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
      if (isNative) {
        // Código para mobile/nativo (Capacitor)
        const status = await BarcodeScanner.checkPermissions();
        
        if (status.camera === 'granted') {
          setHasPermission(true);
          startNativeScanner();
        } else if (status.camera === 'denied') {
          toast({
            title: "Permissão necessária",
            description: "Habilite a permissão de câmera nas configurações do app",
            variant: "destructive",
          });
          onClose();
        } else {
          const newStatus = await BarcodeScanner.requestPermissions();
          if (newStatus.camera === 'granted') {
            setHasPermission(true);
            startNativeScanner();
          } else {
            toast({
              title: "Permissão negada",
              description: "É necessário permitir o acesso à câmera",
              variant: "destructive",
            });
            onClose();
          }
        }
      } else {
        // Código para web/desktop
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
      document.body.style.background = "transparent";
      
      await BarcodeScanner.startScan({
        formats: [],
        lensFacing: LensFacing.Back
      });

      BarcodeScanner.addListener('barcodeScanned', (result) => {
        console.log("QR Code escaneado:", result.barcode.rawValue);
        onScanSuccess(result.barcode.rawValue);
        stopScanner();
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
      
      // Aguarda um pouco para o DOM estar pronto
      setTimeout(() => {
        if (document.getElementById("qr-reader")) {
          scannerRef.current = new Html5QrcodeScanner(
            "qr-reader",
            {
              fps: 10,
              qrbox: { width: 250, height: 250 },
              aspectRatio: 1.0,
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
              // Ignora erros de escaneamento contínuo
              console.debug("Scanner error:", error);
            }
          );
        }
      }, 100);
      
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
        document.body.style.background = "";
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

  // Se estiver escaneando, mostra overlay mínimo
  if (isScanning) {
    if (isNative) {
      // Interface para mobile nativo
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
    } else {
      // Interface para web/desktop
      return (
        <div className="fixed inset-0 bg-background/90 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-lg p-6 relative">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Escanear QR Code</h2>
              <Button variant="ghost" size="sm" onClick={handleClose}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            
            {/* Container para o scanner web */}
            <div id="qr-reader" className="w-full"></div>
            
            <div className="text-center text-xs text-muted-foreground mt-4">
              Posicione o QR Code na frente da câmera
            </div>
          </Card>
        </div>
      );
    }
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
