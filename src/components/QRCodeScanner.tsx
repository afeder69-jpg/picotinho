import { useEffect, useState } from 'react';
import { BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';
import { Capacitor } from '@capacitor/core';
import { Button } from './ui/button';
import { toast } from '@/hooks/use-toast';
import { X, Keyboard } from 'lucide-react';
import ManualKeyInput from './ManualKeyInput';
import { construirUrlConsulta } from '@/lib/documentDetection';

interface QRCodeScannerProps {
  onScanSuccess: (data: string) => void;
  onClose: () => void;
}

const QRCodeScanner = ({ onScanSuccess, onClose }: QRCodeScannerProps) => {
  const [isScanning, setIsScanning] = useState(false);
  const [showManualInput, setShowManualInput] = useState(false);

  const handleManualKeySubmit = async (chaveAcesso: string) => {
    console.log('⌨️ [MANUAL KEY] Chave digitada:', chaveAcesso);
    
    // Construir URL de consulta a partir da chave
    const url = construirUrlConsulta(chaveAcesso);
    console.log('🔗 [MANUAL KEY] URL construída:', url);
    
    toast({
      title: "✅ Chave validada",
      description: "Processando nota fiscal...",
    });
    
    setShowManualInput(false);
    await stopScan();
    onScanSuccess(url);
  };

  useEffect(() => {
    // Verificar se está em plataforma nativa
    if (!Capacitor.isNativePlatform()) {
      toast({
        title: "Scanner não disponível",
        description: "O scanner QR está disponível apenas no aplicativo móvel",
        variant: "destructive"
      });
      onClose();
      return;
    }

    startScan();

    // Cleanup ao desmontar componente
    return () => {
      stopScan();
    };
  }, []);

  const startScan = async () => {
    try {
      // Solicitar permissões de câmera
      const { camera } = await BarcodeScanner.requestPermissions();
      
      if (camera !== 'granted') {
        toast({
          title: "Permissão negada",
          description: "É necessário permitir o acesso à câmera para usar o scanner",
          variant: "destructive"
        });
        onClose();
        return;
      }

      // Verificar se módulo ML Kit está disponível (apenas Android)
      if (Capacitor.getPlatform() === 'android') {
        console.log('🔍 Verificando disponibilidade do módulo ML Kit...');
        
        const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
        
        if (!available) {
          console.log('📥 Módulo ML Kit não disponível. Instalando...');
          
          toast({
            title: "Preparando Scanner",
            description: "Baixando componentes necessários pela primeira vez...",
            duration: 10000,
          });
          
          // Listener para progresso de instalação
          const listener = await BarcodeScanner.addListener(
            'googleBarcodeScannerModuleInstallProgress',
            (event) => {
              console.log(`📊 Progresso da instalação: ${JSON.stringify(event)}`);
              
              if (event.progress >= 100) {
                console.log('✅ Módulo ML Kit instalado com sucesso!');
                toast({
                  title: "Scanner Pronto!",
                  description: "Componentes instalados. Iniciando scanner...",
                });
              }
            }
          );
          
          // Iniciar instalação
          await BarcodeScanner.installGoogleBarcodeScannerModule();
          
          // Aguardar alguns segundos para garantir que a instalação foi concluída
          await new Promise(resolve => setTimeout(resolve, 3000));
          
          // Remover listener
          await listener.remove();
        } else {
          console.log('✅ Módulo ML Kit já disponível!');
        }
      }

      document.body.classList.add('scanner-active');
      setIsScanning(true);

      toast({
        title: "Scanner Ativo",
        description: "Aponte para o QR Code da nota fiscal",
      });

      // Timeout de segurança de 30 segundos
      const scanTimeout = setTimeout(async () => {
        console.error('Scanner timeout - travou após 30s');
        toast({
          title: "Scanner travado",
          description: "O scanner demorou muito para responder. Tente novamente.",
          variant: "destructive"
        });
        await stopScan();
      }, 30000);

      // Iniciar scanner
      const result = await BarcodeScanner.scan();
      
      clearTimeout(scanTimeout);
      
      if (result.barcodes && result.barcodes.length > 0) {
        const scannedData = result.barcodes[0].rawValue;
        
        toast({
          title: "QR Code detectado",
          description: "Processando informações...",
        });
        
        onScanSuccess(scannedData);
      }
      
      await stopScan();
      
    } catch (error) {
      console.error('❌ Erro ao escanear:', error);
      
      // Verificar se é erro de módulo não instalado
      if (error.message?.includes('module') || error.message?.includes('DEPENDENCIES')) {
        toast({
          title: "Erro: Módulo não instalado",
          description: "Reinstale o aplicativo ou verifique sua conexão com internet.",
          variant: "destructive",
          duration: 8000,
        });
      } else {
        toast({
          title: "Erro no scanner",
          description: "Não foi possível iniciar o scanner. Tente novamente.",
          variant: "destructive"
        });
      }
      
      await stopScan();
    }
  };

  const stopScan = async () => {
    try {
      setIsScanning(false);
      document.body.classList.remove('scanner-active');
      await BarcodeScanner.stopScan();
      onClose();
    } catch (error) {
      console.error('Erro ao parar scanner:', error);
      onClose();
    }
  };

  if (!Capacitor.isNativePlatform()) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-between p-6 bg-transparent">
      {/* Overlay para fechar */}
      <div className="absolute inset-0 bg-black/50" onClick={stopScan} />
      
      {/* Botão de fechar */}
      <div className="relative z-10 w-full flex justify-end">
        <Button
          variant="destructive"
          size="lg"
          className="rounded-full shadow-lg"
          onClick={stopScan}
        >
          <X className="w-6 h-6" />
          <span className="ml-2">Cancelar</span>
        </Button>
      </div>

      {/* Instruções */}
      {isScanning && (
        <div className="relative z-10 bg-background/90 backdrop-blur-sm p-6 rounded-lg shadow-lg text-center max-w-sm mx-4">
          <p className="text-lg font-semibold">Aponte a câmera para o QR Code</p>
          <p className="text-sm text-muted-foreground mt-2">
            O scanner detectará automaticamente o código
          </p>
          
          {/* Botão de entrada manual */}
          <Button
            variant="outline"
            className="w-full mt-4"
            onClick={() => setShowManualInput(true)}
          >
            <Keyboard className="w-4 h-4 mr-2" />
            Digitar Chave Manualmente
          </Button>
        </div>
      )}
      
      {/* Modal de entrada manual */}
      {showManualInput && (
        <ManualKeyInput
          onSubmit={handleManualKeySubmit}
          onClose={() => setShowManualInput(false)}
        />
      )}
    </div>
  );
};

export default QRCodeScanner;
