import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Check, X, Loader2 } from "lucide-react";

interface ReceiptViewerProps {
  url: string;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

const ReceiptViewer = ({ url, isOpen, onClose, onConfirm }: ReceiptViewerProps) => {
  const [isProcessing, setIsProcessing] = useState(false);

  const handleConfirm = async () => {
    setIsProcessing(true);
    await onConfirm();
    setIsProcessing(false);
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

      {/* Iframe com HTML da Receita Federal */}
      <div className="flex-1 relative">
        <iframe 
          src={url} 
          className="w-full h-full border-0"
          title="Nota Fiscal - Receita Federal"
          sandbox="allow-same-origin allow-scripts allow-forms"
        />
        
        {/* Overlay com instrução */}
        <div className="absolute top-4 left-4 right-4 bg-background/95 backdrop-blur-sm border rounded-lg p-3 shadow-lg">
          <p className="text-sm font-medium text-center">
            📋 Verifique se a nota fiscal carregou corretamente
          </p>
        </div>
      </div>

      {/* Botões flutuantes na parte inferior */}
      <div className="bg-background/95 backdrop-blur-sm border-t p-4">
        <div className="flex gap-3 max-w-md mx-auto">
          <Button
            onClick={onClose}
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