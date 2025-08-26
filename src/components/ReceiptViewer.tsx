import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Check, X, Loader2 } from "lucide-react";
import html2canvas from "html2canvas";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";

interface ReceiptViewerProps {
  url: string;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

const ReceiptViewer = ({ url, isOpen, onClose, onConfirm }: ReceiptViewerProps) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const { user } = useAuth();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const captureFullPage = async (iframe: HTMLIFrameElement): Promise<string> => {
    return new Promise((resolve, reject) => {
      try {
        const iframeDocument = iframe.contentDocument || iframe.contentWindow?.document;
        if (!iframeDocument) {
          throw new Error("Não foi possível acessar o conteúdo da página");
        }

        // Captura a página inteira do iframe, incluindo conteúdo que requer rolagem
        html2canvas(iframeDocument.body, {
          useCORS: true,
          allowTaint: true,
          height: iframeDocument.body.scrollHeight,
          width: iframeDocument.body.scrollWidth,
          scale: 1,
          backgroundColor: '#ffffff',
          scrollX: 0,
          scrollY: 0
        }).then(canvas => {
          canvas.toBlob((blob) => {
            if (blob) {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = () => reject(new Error("Erro ao converter imagem"));
              reader.readAsDataURL(blob);
            } else {
              reject(new Error("Erro ao gerar imagem"));
            }
          }, 'image/jpeg', 0.9);
        }).catch(reject);
      } catch (error) {
        reject(error);
      }
    });
  };

  const uploadImageToSupabase = async (dataUrl: string): Promise<{ path: string; url: string }> => {
    const base64Data = dataUrl.split(',')[1];
    const byteCharacters = atob(base64Data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: 'image/jpeg' });
    
    const fileName = `nota-${Date.now()}.jpg`;
    const filePath = `${user?.id}/${fileName}`;
    
    const { data, error } = await supabase.storage
      .from('receipts')
      .upload(filePath, blob);
    
    if (error) throw error;
    
    const { data: urlData } = supabase.storage
      .from('receipts')
      .getPublicUrl(filePath);
    
    return { path: filePath, url: urlData.publicUrl };
  };

  const handleConfirmNote = async () => {
    if (!user) {
      toast({
        title: "Erro",
        description: "Você precisa estar logado para salvar a nota.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsProcessing(true);

      // Aguarda um momento para garantir que a página esteja totalmente carregada
      await new Promise(resolve => setTimeout(resolve, 2000));

      if (!iframeRef.current) {
        throw new Error("Iframe não encontrado");
      }

      // Captura a página inteira do iframe
      const imageDataUrl = await captureFullPage(iframeRef.current);
      
      // Upload da imagem para o Supabase Storage
      const { path, url: imageUrl } = await uploadImageToSupabase(imageDataUrl);
      
      // Salva a referência da imagem no banco
      const { data: notaImagem, error: dbError } = await supabase
        .from('notas_imagens')
        .insert({
          usuario_id: user.id,
          imagem_url: imageUrl,
          imagem_path: path,
          processada: false
        })
        .select()
        .single();

      if (dbError) throw dbError;

      // Processa a imagem com IA em segundo plano
      supabase.functions.invoke('process-receipt-full', {
        body: {
          notaImagemId: notaImagem.id,
          imageUrl: imageUrl,
          qrUrl: url
        }
      }).catch(error => {
        console.error('Erro no processamento em segundo plano:', error);
      });
      
      toast({
        title: "Nota salva com sucesso!",
        description: "A nota foi salva e está sendo processada em segundo plano.",
      });

      onConfirm();

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
          ref={iframeRef}
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