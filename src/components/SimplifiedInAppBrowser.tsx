import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Check, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { TipoDocumento, extrairChaveNFe } from '@/lib/documentDetection';
import { Dialog, DialogContent } from '@/components/ui/dialog';

interface SimplifiedInAppBrowserProps {
  url: string;
  userId: string;
  tipoDocumento: TipoDocumento;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export const SimplifiedInAppBrowser = ({
  url,
  userId,
  tipoDocumento,
  isOpen,
  onClose,
  onConfirm,
}: SimplifiedInAppBrowserProps) => {
  const [isProcessing, setIsProcessing] = useState(false);


  const handleConfirm = async () => {
    setIsProcessing(true);
    
    try {
      console.log('✅ [CONFIRM] Processando nota:', { tipoDocumento, url });

      // Extrair chave de acesso
      const chaveAcesso = extrairChaveNFe(url);
      
      if (!chaveAcesso) {
        throw new Error('Não foi possível extrair a chave de acesso da URL');
      }

      console.log('🔑 [CHAVE] Chave extraída:', chaveAcesso);

      // Processar via edge function
      const { data, error } = await supabase.functions.invoke('process-url-nota', {
        body: {
          url,
          userId,
          chaveAcesso,
          tipoDocumento,
        },
      });

      if (error) throw error;

      console.log('✅ [PROCESSO] Nota processada:', data);

      toast({
        title: "✅ Nota processada com sucesso",
        description: "Atualizando seu estoque...",
      });

      // Confirmar processamento
      onConfirm();

    } catch (error: any) {
      console.error('❌ [ERRO] Falha ao processar nota:', error);
      
      toast({
        title: "Erro ao processar nota",
        description: error.message || "Tente novamente",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancel = () => {
    console.log('❌ [CANCEL] Cancelando visualização');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-full w-full h-full p-0 gap-0">
        {/* IFrame da Nota Fiscal */}
        <div className="relative w-full h-full">
          <iframe
            src={url}
            className="w-full h-full border-0"
            title="Nota Fiscal"
            sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
          />
          
          {/* Botões Flutuantes */}
          <div className="fixed bottom-8 left-0 right-0 z-[9999]">
            <div className="flex justify-center items-center gap-6 w-full p-4">
              {/* Botão Cancelar - Vermelho */}
              <Button
                variant="destructive"
                size="lg"
                className="h-16 w-16 rounded-full bg-red-600 hover:bg-red-700 text-white shadow-2xl"
                onClick={handleCancel}
                disabled={isProcessing}
              >
                <X className="w-8 h-8" />
              </Button>

              {/* Botão Confirmar - Verde */}
              <Button
                variant="default"
                size="lg"
                className="h-20 w-20 rounded-full bg-green-600 hover:bg-green-700 text-white shadow-2xl disabled:opacity-50"
                onClick={handleConfirm}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white" />
                ) : (
                  <Check className="w-10 h-10" />
                )}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
