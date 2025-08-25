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
  const [hasPermission, setHasPermission] = useState(false);
  const [isNative, setIsNative] = useState(false);

  useEffect(() => {
    setIsNative(Capacitor.isNativePlatform());
  }, []);

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
      console.log("Verificando ambiente:", { isNative: Capacitor.isNativePlatform() });
      
      if (!Capacitor.isNativePlatform()) {
        // No navegador, usar entrada manual
        toast({
          title: "Modo navegador",
          description: "Use o scanner manual no navegador",
          variant: "default",
        });
        setHasPermission(true);
        return;
      }

      // Verificar se o plugin está disponível
      try {
        const { BarcodeScanner } = await import("@capacitor-community/barcode-scanner");
        console.log("Plugin BarcodeScanner carregado:", BarcodeScanner);
        
        if (!BarcodeScanner) {
          throw new Error("Plugin não disponível");
        }

        // Verificar e solicitar permissões
        console.log("Verificando permissões...");
        const status = await BarcodeScanner.checkPermission({ force: true });
        console.log("Status da permissão:", status);
        
        if (status.granted) {
          setHasPermission(true);
          startNativeScanner();
        } else if (status.denied) {
          throw new Error("Permissão de câmera negada permanentemente");
        } else {
          throw new Error("Permissão de câmera não concedida");
        }
        
      } catch (pluginError) {
        console.error("Erro do plugin:", pluginError);
        throw new Error(`Plugin error: ${pluginError.message}`);
      }
      
    } catch (error) {
      console.error("Erro detalhado:", error);
      toast({
        title: "Erro de câmera",
        description: `${error.message || 'Erro desconhecido'}`,
        variant: "destructive",
      });
      onClose();
    }
  };

  const startNativeScanner = async () => {
    try {
      setIsScanning(true);
      const { BarcodeScanner } = await import("@capacitor-community/barcode-scanner");
      
      console.log("Iniciando scanner nativo...");
      
      // Esconder o background da webview
      await BarcodeScanner.hideBackground();
      document.body.classList.add('scanner-active');
      
      const result = await BarcodeScanner.startScan();
      console.log("Resultado do scan:", result);
      
      if (result.hasContent) {
        onScanSuccess(result.content);
        
        toast({
          title: "QR Code detectado!",
          description: "Processando informações...",
        });
        
        await stopScanner();
        onClose();
      }
      
    } catch (error) {
      console.error("Erro ao iniciar scanner nativo:", error);
      toast({
        title: "Erro ao escanear",
        description: `Falha no scanner: ${error.message}`,
        variant: "destructive",
      });
      await stopScanner();
    }
  };

  const stopScanner = async () => {
    try {
      if (isNative) {
        const { BarcodeScanner } = await import("@capacitor-community/barcode-scanner");
        await BarcodeScanner.showBackground();
        await BarcodeScanner.stopScan();
        document.body.classList.remove('scanner-active');
      }
      setIsScanning(false);
      console.log("Scanner parado");
    } catch (error) {
      console.warn("Erro ao parar scanner:", error);
      setIsScanning(false);
    }
  };

  const handleClose = () => {
    stopScanner();
    onClose();
  };

  const handleManualInput = () => {
    const input = prompt("Digite o código QR manualmente:");
    if (input && input.trim()) {
      onScanSuccess(input.trim());
      onClose();
    }
  };

  if (!isOpen) return null;

  // Se estiver escaneando no nativo, mostrar overlay transparente
  if (isScanning && isNative) {
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
          
          {!isNative && (
            <div className="space-y-2">
              <Button 
                onClick={handleManualInput}
                variant="outline" 
                className="w-full"
              >
                Digite o código manualmente
              </Button>
              <div className="text-center text-xs text-muted-foreground">
                Scanner QR funciona melhor no app instalado
              </div>
            </div>
          )}
          
          {isNative && (
            <div className="text-center text-xs text-muted-foreground">
              A câmera traseira será aberta automaticamente
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};

export default QRCodeScanner;