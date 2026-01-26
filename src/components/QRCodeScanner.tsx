import { useEffect, useState } from 'react';
import { BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { Button } from './ui/button';
import { toast } from '@/hooks/use-toast';
import { X, Camera as CameraIcon, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface QRCodeScannerProps {
  onScanSuccess: (data: string) => void;
  onClose: () => void;
}

const QRCodeScanner = ({ onScanSuccess, onClose }: QRCodeScannerProps) => {
  const [isScanning, setIsScanning] = useState(false);
  const [isProcessingPhoto, setIsProcessingPhoto] = useState(false);

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
      
    } catch (error: any) {
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

  const handlePhotoCapture = async () => {
    try {
      setIsProcessingPhoto(true);

      // Pausar scanner temporariamente
      try {
        await BarcodeScanner.stopScan();
      } catch (e) {
        // Ignorar erro se já parou
      }

      // Capturar foto usando Capacitor Camera
      const photo = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.Base64,
        source: CameraSource.Camera,
        promptLabelHeader: 'Foto da URL',
        promptLabelPhoto: 'Escolher da galeria',
        promptLabelPicture: 'Tirar foto',
      });

      if (!photo.base64String) {
        toast({
          title: "Erro",
          description: "Não foi possível capturar a foto",
          variant: "destructive"
        });
        return;
      }

      console.log('📸 [NATIVE SCANNER] Enviando foto para extração de URL...');

      toast({
        title: "🔍 Analisando foto...",
        description: "Procurando URL na imagem...",
      });

      // Chamar edge function para extrair URL
      const { data, error } = await supabase.functions.invoke('extract-url-from-photo', {
        body: { image_base64: `data:image/jpeg;base64,${photo.base64String}` }
      });

      if (error) {
        throw new Error(error.message);
      }

      if (!data?.success) {
        toast({
          title: "❌ URL não encontrada",
          description: data?.error || "Não foi possível extrair a URL da imagem. Tente tirar uma foto mais nítida.",
          variant: "destructive"
        });
        // Reiniciar scanner
        startScan();
        return;
      }

      console.log('✅ [NATIVE SCANNER] URL extraída:', data.url);

      toast({
        title: "✅ URL detectada",
        description: "Processando nota fiscal...",
      });

      document.body.classList.remove('scanner-active');
      onScanSuccess(data.url);

    } catch (error: any) {
      console.error('❌ [NATIVE SCANNER] Erro ao processar foto:', error);
      
      // Se usuário cancelou, apenas reiniciar scanner
      if (error.message?.includes('cancelled') || error.message?.includes('canceled')) {
        startScan();
        return;
      }

      toast({
        title: "Erro ao processar foto",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive"
      });
      // Reiniciar scanner
      startScan();
    } finally {
      setIsProcessingPhoto(false);
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

      {/* Área central */}
      <div className="relative z-10 flex-1 flex items-center justify-center">
        {isProcessingPhoto && (
          <div className="bg-background/90 backdrop-blur-sm p-8 rounded-lg shadow-lg flex flex-col items-center gap-4">
            <Loader2 className="w-12 h-12 text-primary animate-spin" />
            <p className="text-lg font-semibold">Analisando foto...</p>
            <p className="text-sm text-muted-foreground">Procurando URL na imagem</p>
          </div>
        )}
      </div>

      {/* Instruções */}
      {isScanning && !isProcessingPhoto && (
        <div className="relative z-10 bg-background/90 backdrop-blur-sm p-6 rounded-lg shadow-lg text-center max-w-sm">
          <p className="text-lg font-semibold">Aponte a câmera para o QR Code</p>
          <p className="text-sm text-muted-foreground mt-2">
            O scanner detectará automaticamente o código
          </p>

          {/* Separador */}
          <div className="flex items-center gap-3 my-4">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground">ou</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* Botão para tirar foto da URL */}
          <Button
            variant="outline"
            className="w-full flex items-center justify-center gap-2"
            onClick={handlePhotoCapture}
            disabled={isProcessingPhoto}
          >
            <CameraIcon className="w-5 h-5" />
            <span>Tirar Foto da URL</span>
          </Button>
          <p className="text-xs text-muted-foreground mt-2">
            Sem QR Code? Tire uma foto da URL impressa
          </p>
        </div>
      )}
    </div>
  );
};

export default QRCodeScanner;
