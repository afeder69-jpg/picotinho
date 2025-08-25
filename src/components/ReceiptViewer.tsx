import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Check, X, Loader2 } from "lucide-react";
import html2canvas from "html2canvas";
import { toast } from "@/hooks/use-toast";

interface ReceiptViewerProps {
  url: string;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

const ReceiptViewer = ({ url, isOpen, onClose, onConfirm }: ReceiptViewerProps) => {
  const [isProcessing, setIsProcessing] = useState(false);

  const handleConfirmNote = async () => {
    try {
      setIsProcessing(true);

      // Aguarda um momento para garantir que a página esteja totalmente carregada
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Captura screenshot da página atual
      const canvas = await html2canvas(document.body, {
        height: window.innerHeight,
        width: window.innerWidth,
        useCORS: true,
        scale: 0.8,
        backgroundColor: '#ffffff'
      });

      // Converte para blob
      canvas.toBlob(async (blob) => {
        if (blob) {
          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = reader.result as string;
            const screenshots = JSON.parse(localStorage.getItem('qr_screenshots') || '[]');
            screenshots.push({
              id: Date.now(),
              url: url,
              timestamp: new Date().toISOString(),
              screenshot: dataUrl
            });
            localStorage.setItem('qr_screenshots', JSON.stringify(screenshots));
            
            toast({
              title: "Nota salva com sucesso!",
              description: "A nota foi salva em Minhas Notas Salvas.",
            });

            onConfirm();
          };
          reader.readAsDataURL(blob);
        }
      }, 'image/jpeg', 0.9);

    } catch (error) {
      console.error('Erro ao capturar nota:', error);
      toast({
        title: "Erro",
        description: "Não foi possível salvar a nota. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-background z-50 flex flex-col">
      {/* Header with close button */}
      <div className="bg-background border-b p-4 flex justify-between items-center">
        <h2 className="text-lg font-semibold">Nota Fiscal</h2>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Iframe container */}
      <div className="flex-1 overflow-hidden">
        <iframe
          src={url}
          className="w-full h-full border-0"
          title="Nota Fiscal - Receita Federal"
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
        />
      </div>

      {/* Fixed bottom button */}
      <div className="bg-background border-t p-4">
        <Button
          onClick={handleConfirmNote}
          disabled={isProcessing}
          className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3"
          size="lg"
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Salvando nota...
            </>
          ) : (
            <>
              <Check className="w-4 h-4 mr-2" />
              Confirmar Nota
            </>
          )}
        </Button>
      </div>
    </div>
  );
};

export default ReceiptViewer;