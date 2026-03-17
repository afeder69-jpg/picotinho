import { useEffect, useState } from 'react';
import { BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';
import { Capacitor } from '@capacitor/core';
import { Button } from './ui/button';
import { toast } from '@/hooks/use-toast';
import { Keyboard, QrCode, ArrowLeft, ScanBarcode } from 'lucide-react';
import ManualKeyInput from './ManualKeyInput';
import { construirUrlConsulta, limparChaveAcesso, validarChaveAcesso } from '@/lib/documentDetection';

interface QRCodeScannerProps {
  onScanSuccess: (data: string) => void;
  onClose: () => void;
}

type ScannerMode = 'choose' | 'scanning' | 'manual' | 'barcode';

const QRCodeScanner = ({ onScanSuccess, onClose }: QRCodeScannerProps) => {
  const [mode, setMode] = useState<ScannerMode>('choose');

  const processAccessKey = (chaveAcesso: string, source: 'manual' | 'barcode') => {
    const chaveLimpa = limparChaveAcesso(chaveAcesso);
    const validacao = validarChaveAcesso(chaveLimpa);

    if (!validacao.valida) {
      toast({
        title: source === 'barcode' ? 'Código de barras inválido' : 'Chave inválida',
        description: validacao.erro || 'Não foi possível validar a chave de acesso.',
        variant: 'destructive',
      });
      setMode('choose');
      return;
    }

    const url = construirUrlConsulta(chaveLimpa);

    toast({
      title: '✅ Chave validada',
      description: 'Processando nota fiscal...',
    });

    onScanSuccess(url);
  };

  const handleManualKeySubmit = async (chaveAcesso: string) => {
    console.log('⌨️ [MANUAL KEY] Chave digitada:', chaveAcesso);
    processAccessKey(chaveAcesso, 'manual');
  };

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      toast({
        title: 'Scanner não disponível',
        description: 'O scanner QR está disponível apenas no aplicativo móvel',
        variant: 'destructive'
      });
      onClose();
    }
  }, []);

  const ensureScannerReady = async () => {
    const { camera } = await BarcodeScanner.requestPermissions();

    if (camera !== 'granted') {
      toast({
        title: 'Permissão negada',
        description: 'É necessário permitir o acesso à câmera para usar o scanner',
        variant: 'destructive'
      });
      setMode('choose');
      return false;
    }

    if (Capacitor.getPlatform() === 'android') {
      console.log('🔍 Verificando disponibilidade do módulo ML Kit...');

      const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();

      if (!available) {
        console.log('📥 Módulo ML Kit não disponível. Instalando...');

        toast({
          title: 'Preparando Scanner',
          description: 'Baixando componentes necessários pela primeira vez...',
          duration: 10000,
        });

        const listener = await BarcodeScanner.addListener(
          'googleBarcodeScannerModuleInstallProgress',
          (event) => {
            console.log(`📊 Progresso da instalação: ${JSON.stringify(event)}`);

            if (event.progress >= 100) {
              console.log('✅ Módulo ML Kit instalado com sucesso!');
              toast({
                title: 'Scanner Pronto!',
                description: 'Componentes instalados. Iniciando scanner...',
              });
            }
          }
        );

        await BarcodeScanner.installGoogleBarcodeScannerModule();
        await new Promise(resolve => setTimeout(resolve, 3000));
        await listener.remove();
      } else {
        console.log('✅ Módulo ML Kit já disponível!');
      }
    }

    return true;
  };

  const startScan = async (scanMode: 'scanning' | 'barcode') => {
    try {
      const ready = await ensureScannerReady();
      if (!ready) return;

      setMode(scanMode);

      const result = await BarcodeScanner.scan();

      if (result.barcodes && result.barcodes.length > 0) {
        const scannedData = result.barcodes[0].rawValue || '';

        if (scanMode === 'barcode') {
          console.log('📦 [BARCODE] Código lido:', scannedData);
          processAccessKey(scannedData, 'barcode');
          return;
        }

        toast({
          title: 'QR Code detectado',
          description: 'Processando informações...',
        });

        onScanSuccess(scannedData);
      } else {
        setMode('choose');
      }

    } catch (error: any) {
      console.log('📋 [SCANNER] Scanner finalizado:', error?.message || error);

      const msg = (error?.message || '').toLowerCase();
      const isCancelled = msg.includes('cancel') || msg.includes('closed') || msg.includes('dismissed');

      if (isCancelled) {
        console.log('ℹ️ [SCANNER] Usuário cancelou o scanner');
        setMode('choose');
        return;
      }

      if (msg.includes('module') || msg.includes('dependencies')) {
        toast({
          title: 'Erro: Módulo não instalado',
          description: 'Reinstale o aplicativo ou verifique sua conexão com internet.',
          variant: 'destructive',
          duration: 8000,
        });
      } else {
        toast({
          title: 'Erro no scanner',
          description: scanMode === 'barcode'
            ? 'Não foi possível ler o código de barras da chave. Tente novamente.'
            : 'Não foi possível iniciar o scanner. Tente novamente.',
          variant: 'destructive'
        });
      }

      setMode('choose');
    }
  };

  if (!Capacitor.isNativePlatform()) {
    return null;
  }

  if (mode === 'manual') {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70">
        <ManualKeyInput
          onSubmit={handleManualKeySubmit}
          onClose={() => setMode('choose')}
        />
      </div>
    );
  }

  if (mode === 'choose') {
    return (
      <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background">
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-4">
          <Button
            variant="ghost"
            size="lg"
            onClick={onClose}
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            Voltar
          </Button>
        </div>

        <div className="flex flex-col items-center gap-8 px-6 max-w-sm w-full">
          <div className="text-center">
            <h2 className="text-2xl font-bold mb-2">Ler Nota Fiscal</h2>
            <p className="text-muted-foreground">
              Escolha como deseja informar a nota fiscal
            </p>
          </div>

          <div className="flex flex-col gap-4 w-full">
            <Button
              size="lg"
              className="w-full h-20 text-lg flex flex-col items-center gap-1"
              onClick={() => startScan('scanning')}
            >
              <QrCode className="w-7 h-7" />
              Escanear QR Code
            </Button>

            <Button
              variant="outline"
              size="lg"
              className="w-full h-20 text-lg flex flex-col items-center gap-1"
              onClick={() => setMode('manual')}
            >
              <Keyboard className="w-7 h-7" />
              Digitar Chave Manualmente
            </Button>

            <Button
              variant="outline"
              size="lg"
              className="w-full h-20 text-lg flex flex-col items-center gap-1"
              onClick={() => startScan('barcode')}
            >
              <ScanBarcode className="w-7 h-7" />
              Ler Código de Barras da Chave
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const loadingText = mode === 'barcode' ? 'Abrindo leitor de código de barras...' : 'Abrindo scanner...';

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black">
      <div className="text-center">
        <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-primary-foreground text-lg">{loadingText}</p>
      </div>
    </div>
  );
};

export default QRCodeScanner;
