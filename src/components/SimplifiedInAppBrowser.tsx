import { useEffect, useState } from 'react';
import { Browser } from '@capacitor/browser';
import { Button } from '@/components/ui/button';
import { Check, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { TipoDocumento, extrairChaveNFe } from '@/lib/documentDetection';

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

  useEffect(() => {
    if (isOpen) {
      openBrowser();
    }

    return () => {
      Browser.close();
    };
  }, [isOpen, url]);

  const openBrowser = async () => {
    try {
      console.log('🌐 [BROWSER] Abrindo navegador interno:', { url, tipoDocumento });
      
      await Browser.open({
        url,
        presentationStyle: 'fullscreen',
        toolbarColor: '#10b981', // green-500
      });

      // Listener para quando usuário fecha manualmente
      Browser.addListener('browserFinished', () => {
        console.log('❌ [BROWSER] Usuário fechou o navegador');
        onClose();
      });

    } catch (error) {
      console.error('❌ [BROWSER] Erro ao abrir navegador:', error);
      toast({
        title: "Erro ao abrir navegador",
        description: "Não foi possível abrir a nota fiscal",
        variant: "destructive",
      });
      onClose();
    }
  };

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

      // Fechar navegador e confirmar
      await Browser.close();
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

  const handleCancel = async () => {
    console.log('❌ [CANCEL] Cancelando visualização');
    await Browser.close();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed bottom-20 left-0 right-0 z-[100] pointer-events-none">
      <div className="flex justify-center items-center gap-4 w-full max-w-screen-lg mx-auto p-4">
        {/* Botão Cancelar - Vermelho */}
        <Button
          variant="destructive"
          size="lg"
          className="h-16 w-16 rounded-full bg-red-600 hover:bg-red-700 text-white shadow-2xl pointer-events-auto"
          onClick={handleCancel}
          disabled={isProcessing}
        >
          <X className="w-8 h-8" />
        </Button>

        {/* Botão Confirmar - Verde */}
        <Button
          variant="default"
          size="lg"
          className="h-20 w-20 rounded-full bg-green-600 hover:bg-green-700 text-white shadow-2xl pointer-events-auto disabled:opacity-50"
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
  );
};
