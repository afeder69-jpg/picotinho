import { useEffect } from "react";
import { BarcodeScanner } from '@capacitor-community/barcode-scanner';
import { toast } from "@/hooks/use-toast";
import { X } from "lucide-react";
import { Button } from "./ui/button";

interface QRCodeScannerProps {
  onScanSuccess: (url: string) => void;
  onClose: () => void;
  isOpen: boolean;
}

const QRCodeScanner = ({ onScanSuccess, onClose, isOpen }: QRCodeScannerProps) => {
  
  const isValidNFCeUrl = (url: string): boolean => {
    try {
      const urlObj = new URL(url);
      const hasNFCeDomain = /fazenda.*\.gov\.br|sefaz.*\.gov\.br/i.test(urlObj.hostname);
      const hasNFCeParams = urlObj.searchParams.has('chNFe') || urlObj.searchParams.has('p');
      return hasNFCeDomain && hasNFCeParams;
    } catch {
      return false;
    }
  };

  const startNativeScanner = async () => {
    try {
      // Pedir permissão
      const status = await BarcodeScanner.checkPermission({ force: true });
      
      if (!status.granted) {
        toast({
          title: "Permissão negada",
          description: "Permita o acesso à câmera para escanear QR codes",
          variant: "destructive",
        });
        onClose();
        return;
      }

      // Preparar scanner (esconde o fundo)
      await BarcodeScanner.prepare();
      document.body.classList.add('scanner-active');
      
      // Iniciar scan
      const result = await BarcodeScanner.startScan();
      
      // Limpar
      document.body.classList.remove('scanner-active');
      await BarcodeScanner.stopScan();
      
      if (result.hasContent) {
        const scannedUrl = result.content || '';
        
        if (isValidNFCeUrl(scannedUrl)) {
          onScanSuccess(scannedUrl);
        } else {
          toast({
            title: "QR Code inválido",
            description: "Este não é um QR code de Nota Fiscal NFCe válido",
            variant: "destructive",
          });
        }
      }
      
      onClose();
      
    } catch (error: any) {
      console.error("Erro no scanner nativo:", error);
      document.body.classList.remove('scanner-active');
      
      toast({
        title: "Erro no scanner",
        description: error?.message || "Não foi possível abrir o scanner",
        variant: "destructive",
      });
      
      onClose();
    }
  };

  const stopScanning = async () => {
    try {
      document.body.classList.remove('scanner-active');
      await BarcodeScanner.stopScan();
    } catch (error) {
      console.error("Erro ao parar scanner:", error);
    }
    onClose();
  };

  useEffect(() => {
    if (isOpen) {
      startNativeScanner();
    }
    
    return () => {
      document.body.classList.remove('scanner-active');
      BarcodeScanner.stopScan().catch(console.error);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-transparent scanner-ui">
      {/* Botão de fechar */}
      <div className="absolute top-4 right-4 z-50">
        <Button
          variant="outline"
          size="icon"
          onClick={stopScanning}
          className="bg-white/90 hover:bg-white"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      
      {/* Instruções */}
      <div className="absolute top-20 left-0 right-0 z-50 text-center px-4">
        <div className="bg-black/70 text-white p-4 rounded-lg inline-block">
          <p className="font-semibold">Aponte a câmera para o QR Code da NFCe</p>
          <p className="text-sm mt-1">Scanner nativo do Android</p>
        </div>
      </div>
    </div>
  );
};

export default QRCodeScanner;
