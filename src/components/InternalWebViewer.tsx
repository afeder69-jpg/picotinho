import { useState } from "react";
import { Button } from "@/components/ui/button";
import { X, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface InternalWebViewerProps {
  url: string;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  userId: string;
}

const InternalWebViewer = ({ 
  url, 
  isOpen, 
  onClose, 
  onConfirm, 
  userId 
}: InternalWebViewerProps) => {
  const [isProcessing, setIsProcessing] = useState(false);

  if (!isOpen) return null;

  const handleCancel = () => {
    console.log('❌ [INTERNAL VIEWER] Cancelado pelo usuário');
    onClose();
  };

  const handleConfirm = async () => {
    console.log('✅ [INTERNAL VIEWER] Confirmado - processando nota via Serpro...');
    setIsProcessing(true);

    try {
      // Chamar edge function process-nfe-serpro
      const { data, error } = await supabase.functions.invoke('process-nfe-serpro', {
        body: {
          url,
          userId,
        },
      });

      if (error) {
        console.error('❌ [SERPRO] Erro ao processar:', error);
        throw error;
      }

      console.log('✅ [SERPRO] Resposta:', data);

      toast({
        title: data.fromCache 
          ? "💾 Nota processada (cache)" 
          : "✅ Nota processada",
        description: data.message || "Nota fiscal importada com sucesso!",
        duration: 5000,
      });

      // Chamar callback de confirmação (navega para /screenshots)
      onConfirm();

    } catch (error: any) {
      console.error('❌ [ERROR] Falha no processamento:', error);
      
      toast({
        title: "❌ Erro ao processar nota",
        description: error.message || "Não foi possível importar a nota fiscal. Tente novamente.",
        variant: "destructive",
        duration: 6000,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-background">
      {/* Header com botão fechar */}
      <div className="absolute top-0 left-0 right-0 z-10 bg-background/95 backdrop-blur-sm border-b">
        <div className="flex items-center justify-between p-4">
          <h2 className="text-lg font-semibold">Visualizar Nota Fiscal</h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleCancel}
            disabled={isProcessing}
          >
            <X className="w-5 h-5" />
          </Button>
        </div>
      </div>

      {/* Área de visualização (iframe) */}
      <div className="pt-16 pb-28 h-full">
        <div className="w-full h-full bg-muted/30 flex flex-col items-center justify-center p-6">
          <AlertCircle className="w-16 h-16 text-yellow-500 mb-4" />
          <h3 className="text-xl font-semibold mb-2 text-center">
            Visualização da Nota Fiscal
          </h3>
          <p className="text-muted-foreground text-center mb-4 max-w-md">
            A Receita Federal bloqueia a visualização direta da nota em iframe por segurança.
          </p>
          <div className="bg-card p-4 rounded-lg border max-w-md w-full">
            <p className="text-sm font-mono break-all text-muted-foreground">
              {url}
            </p>
          </div>
          <div className="mt-6 space-y-2 text-center text-sm text-muted-foreground">
            <p>✅ <strong>A nota será processada automaticamente</strong></p>
            <p>quando você clicar em <strong>"OK - Confirmar"</strong> abaixo.</p>
            <p className="text-xs mt-4 opacity-70">
              📡 Dados obtidos via API oficial da Serpro
            </p>
          </div>
        </div>
      </div>

      {/* Botões flutuantes na parte inferior */}
      <div className="fixed bottom-0 left-0 right-0 z-10 bg-background border-t p-4 safe-area-inset-bottom">
        <div className="flex gap-3 max-w-screen-lg mx-auto">
          <Button
            variant="outline"
            size="lg"
            className="flex-1 gap-2 h-14 text-base"
            onClick={handleCancel}
            disabled={isProcessing}
          >
            <XCircle className="w-5 h-5" />
            Cancelar
          </Button>
          <Button
            variant="default"
            size="lg"
            className="flex-1 gap-2 h-14 text-base bg-green-600 hover:bg-green-700"
            onClick={handleConfirm}
            disabled={isProcessing}
          >
            <CheckCircle2 className="w-5 h-5" />
            {isProcessing ? "Processando..." : "OK - Confirmar"}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default InternalWebViewer;
