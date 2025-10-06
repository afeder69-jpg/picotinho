import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { Capacitor } from '@capacitor/core';
import { Scanner } from '@yudiel/react-qr-scanner';
import { useToast } from "@/hooks/use-toast";
import { registerPlugin } from '@capacitor/core';

interface MLKitScannerPlugin {
  scanBarcode(): Promise<{ ScanResult: string }>;
}

const MLKitScanner = registerPlugin<MLKitScannerPlugin>('MLKitScanner');

interface QRCodeScannerProps {
  onScanSuccess: (code: string) => void;
  onClose: () => void;
  isOpen: boolean;
}

const QRCodeScanner: React.FC<QRCodeScannerProps> = ({ onScanSuccess, onClose, isOpen }) => {
  const [isScanning, setIsScanning] = useState(false);
  const useNativeScanner = Capacitor.isNativePlatform();
  const { toast } = useToast();

  useEffect(() => {
    if (isOpen && useNativeScanner) {
      startNativeScanner();
    } else if (isOpen && !useNativeScanner) {
      setIsScanning(true);
    }

    return () => {
      setIsScanning(false);
    };
  }, [isOpen]);

  const isValidNFCeUrl = (url: string): boolean => {
    if (!url || typeof url !== 'string') return false;
    
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.toLowerCase();
      
      const isSefazDomain = hostname.includes('sefaz') || 
                           hostname.includes('fazenda') ||
                           hostname.includes('nfce') ||
                           hostname.includes('nfe');
      
      const hasNFCeParams = urlObj.searchParams.has('chNFe') || 
                           urlObj.searchParams.has('p') ||
                           urlObj.searchParams.has('tpAmb');
      
      return isSefazDomain && hasNFCeParams;
    } catch {
      return false;
    }
  };

  const startNativeScanner = async () => {
    try {
      console.log('🔍 Iniciando Google ML Kit Scanner nativo...');
      setIsScanning(true);

      toast({
        title: "📱 Abrindo Scanner ML Kit",
        description: "Aponte para o QR Code da NFCe",
        duration: 2000,
      });

      const result = await MLKitScanner.scanBarcode();

      setIsScanning(false);

      if (result.ScanResult) {
        const code = result.ScanResult;
        console.log('🎯 QR Code detectado com ML Kit:', code);

        if (isValidNFCeUrl(code)) {
          console.log('✅ NFCe válida detectada com ML Kit!');
          toast({
            title: "✅ NFCe Detectada!",
            description: "Processando nota fiscal...",
            duration: 2000,
          });
          onScanSuccess(code);
          onClose();
        } else {
          console.log('⚠️ QR Code detectado mas não é NFCe válida');
          toast({
            title: "⚠️ QR Code Inválido",
            description: "Este não é um QR Code de NFCe",
            variant: "destructive",
          });
        }
      } else {
        console.log('ℹ️ Scanner fechado sem detectar código');
        toast({
          title: "Scanner Cancelado",
          description: "Nenhum código foi detectado",
        });
      }
    } catch (error: any) {
      console.error('❌ Erro no scanner ML Kit:', error);
      setIsScanning(false);
      
      if (error?.message?.includes('cancel') || error?.message?.includes('User cancelled')) {
        console.log('ℹ️ Usuário cancelou o scanner');
        return;
      }
      
      toast({
        title: "Erro no Scanner",
        description: "Falha ao escanear. Tente novamente.",
        variant: "destructive"
      });
    }
  };

  const handleWebScan = (result: any) => {
    if (result && result[0]?.rawValue) {
      const code = result[0].rawValue;
      console.log('🌐 QR Code detectado (web):', code);

      if (isValidNFCeUrl(code)) {
        console.log('✅ NFCe válida detectada (web)!');
        toast({
          title: "✅ NFCe Detectada!",
          description: "Processando nota fiscal...",
          duration: 2000,
        });
        onScanSuccess(code);
        onClose();
      } else {
        console.log('⚠️ QR Code detectado mas não é NFCe (web)');
        toast({
          title: "⚠️ QR Code Inválido",
          description: "Este não é um QR Code de NFCe",
          variant: "destructive",
        });
      }
    }
  };

  const handleWebError = (error: any) => {
    console.error('❌ Erro no scanner web:', error);
  };

  if (!isOpen) return null;

  // Para Android/iOS, o scanner abre em tela cheia nativamente
  // então apenas mostramos mensagem enquanto aguarda
  if (useNativeScanner) {
    return (
      <div className="fixed inset-0 z-[9999] bg-background/95 backdrop-blur-sm flex items-center justify-center">
        <div className="bg-card p-8 rounded-lg shadow-lg max-w-sm mx-4 text-center space-y-4">
          <div className="text-6xl mb-4">📱</div>
          <h2 className="text-2xl font-bold">Preparando Scanner ML Kit</h2>
          <p className="text-muted-foreground">
            Scanner nativo Google ML Kit abrirá em tela cheia
          </p>
          <p className="text-sm text-muted-foreground">
            Com detecção de cantos (4 pontos amarelos) e autofocus contínuo
          </p>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
        </div>
      </div>
    );
  }

  // Scanner web (navegador)
  return (
    <div className="fixed inset-0 z-[9999] bg-background">
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between p-4 border-b bg-background">
          <h2 className="text-lg font-semibold">Escanear QR Code</h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="flex-1 relative bg-black">
          <div className="w-full h-full">
            <Scanner
              onScan={handleWebScan}
              onError={handleWebError}
              constraints={{
                facingMode: 'environment',
                aspectRatio: { ideal: 1 }
              }}
              styles={{
                container: {
                  width: '100%',
                  height: '100%',
                  position: 'relative'
                },
                video: {
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover'
                }
              }}
            />
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none">
              <div className="w-64 h-64 border-4 border-white rounded-lg opacity-50"></div>
            </div>
          </div>
        </div>

        <div className="p-4 border-t bg-background">
          <p className="text-sm text-muted-foreground text-center">
            Posicione o QR Code dentro da área marcada
          </p>
        </div>
      </div>
    </div>
  );
};

export default QRCodeScanner;
