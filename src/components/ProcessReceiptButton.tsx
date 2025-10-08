import { Button } from "@/components/ui/button";
import { CheckCircle, Loader2 } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";

interface ProcessReceiptButtonProps {
  notaId: string;
  onProcessed: () => void;
}

export const ProcessReceiptButton = ({ notaId, onProcessed }: ProcessReceiptButtonProps) => {
  const [processing, setProcessing] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleProcess = async () => {
    setProcessing(true);
    
    try {
      toast({
        title: "Processando nota...",
        description: "Extraindo dados e adicionando ao estoque",
      });

      const { error } = await supabase.functions.invoke('process-receipt-full', {
        body: { notaId, force: true }
      });

      if (error) throw error;

      toast({
        title: "✅ Nota processada!",
        description: "Produtos adicionados ao estoque com sucesso",
      });

      onProcessed();
      
      // Aguardar 1 segundo e redirecionar para o estoque
      setTimeout(() => {
        navigate('/estoque');
      }, 1000);

    } catch (error) {
      console.error("Erro ao processar nota:", error);
      toast({
        title: "Erro ao processar",
        description: "Não foi possível processar a nota. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Button
      onClick={handleProcess}
      disabled={processing}
      size="lg"
      className="fixed bottom-24 right-6 z-40 h-16 w-16 rounded-full bg-green-600 hover:bg-green-700 text-white shadow-lg flex items-center justify-center animate-pulse"
    >
      {processing ? (
        <Loader2 className="h-6 w-6 animate-spin" />
      ) : (
        <CheckCircle className="h-6 w-6" />
      )}
    </Button>
  );
};
