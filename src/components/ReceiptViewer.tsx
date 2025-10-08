import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Check, X, Loader2, ExternalLink } from "lucide-react";
import { Browser } from "@capacitor/browser";
import { useToast } from "@/hooks/use-toast";

interface ReceiptViewerProps {
  url: string;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

const ReceiptViewer = ({ url, isOpen, onClose, onConfirm }: ReceiptViewerProps) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [browserOpened, setBrowserOpened] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (isOpen && !browserOpened) {
      openReceiptInBrowser();
    }
  }, [isOpen, browserOpened]);

  const openReceiptInBrowser = async () => {
    try {
      // Abre a URL em navegador nativo fullscreen
      await Browser.open({ 
        url,
        presentationStyle: 'fullscreen',
        toolbarColor: '#ffffff'
      });
      
      setBrowserOpened(true);
      
      // Listener para quando o usuário fechar o browser diretamente
      Browser.addListener('browserFinished', () => {
        handleBrowserClosed();
      });
      
    } catch (error) {
      console.error('Erro ao abrir browser:', error);
      toast({
        title: "Erro ao abrir nota",
        description: "Não foi possível visualizar a nota fiscal",
        variant: "destructive"
      });
      onClose();
    }
  };

  const handleBrowserClosed = () => {
    setBrowserOpened(false);
    onClose();
  };

  const handleConfirm = async () => {
    setIsProcessing(true);
    await onConfirm();
    setIsProcessing(false);
    setBrowserOpened(false);
  };

  const handleCancel = async () => {
    // Fecha o browser antes de cancelar
    await Browser.close();
    setBrowserOpened(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-background z-50 flex flex-col">
      {/* Header */}
      <div className="bg-background border-b p-4 flex justify-between items-center">
        <h2 className="text-lg font-semibold">Nota Fiscal - Receita Federal</h2>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="w-5 h-5" />
        </Button>
      </div>

      {/* Tela de espera enquanto usuário visualiza no navegador nativo */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 bg-gradient-to-b from-background to-muted/20">
        <div className="max-w-md w-full space-y-6 text-center">
          <div className="w-20 h-20 mx-auto bg-primary/10 rounded-full flex items-center justify-center">
            <ExternalLink className="w-10 h-10 text-primary" />
          </div>
          
          <div className="space-y-2">
            <h3 className="text-xl font-semibold">Nota aberta no navegador</h3>
            <p className="text-muted-foreground">
              A nota fiscal da Receita Federal foi aberta em uma nova janela do navegador.
            </p>
          </div>

          <div className="bg-card border rounded-lg p-4 space-y-2 text-left">
            <p className="text-sm font-medium flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">1</span>
              Verifique se a nota carregou corretamente
            </p>
            <p className="text-sm font-medium flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">2</span>
              Volte para este app
            </p>
            <p className="text-sm font-medium flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">3</span>
              Clique em "OK - Confirmar" para processar
            </p>
          </div>
        </div>
      </div>

      {/* Botões flutuantes na parte inferior */}
      <div className="bg-background/95 backdrop-blur-sm border-t p-4">
        <div className="flex gap-3 max-w-md mx-auto">
          <Button
            onClick={handleCancel}
            variant="destructive"
            size="lg"
            className="flex-1 font-semibold"
          >
            <X className="w-5 h-5 mr-2" />
            Cancelar
          </Button>
          
          <Button
            onClick={handleConfirm}
            disabled={isProcessing}
            size="lg"
            className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Capturando...
              </>
            ) : (
              <>
                <Check className="w-5 h-5 mr-2" />
                OK - Confirmar
              </>
            )}
          </Button>
        </div>
        
        <p className="text-xs text-muted-foreground text-center mt-3">
          Se a página estiver cinza ou com erro, clique em <strong>Cancelar</strong>
        </p>
      </div>
    </div>
  );
};

export default ReceiptViewer;