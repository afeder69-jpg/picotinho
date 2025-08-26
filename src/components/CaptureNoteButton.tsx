import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Camera, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";

interface CaptureNoteButtonProps {
  onCaptureSuccess?: () => void;
}

const CaptureNoteButton = ({ onCaptureSuccess }: CaptureNoteButtonProps) => {
  const [isCapturing, setIsCapturing] = useState(false);
  const [receiptUrl, setReceiptUrl] = useState("");
  const { user } = useAuth();

  const handleCaptureNote = async () => {
    if (!user) {
      toast({
        title: "Erro",
        description: "Você precisa estar logado para capturar notas.",
        variant: "destructive",
      });
      return;
    }

    if (!receiptUrl.trim()) {
      toast({
        title: "URL necessária",
        description: "Cole a URL da nota fiscal que você visualizou no navegador.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsCapturing(true);
      
      // Usar a edge function para capturar e salvar a nota
      const { data, error } = await supabase.functions.invoke('capture-receipt-external', {
        body: {
          receiptUrl: receiptUrl.trim(),
          userId: user.id
        }
      });
      
      if (error) throw error;
      
      toast({
        title: "📸 Nota capturada com sucesso!",
        description: "A imagem da nota foi salva e aparecerá em 'Minhas Notas'.",
      });

      setReceiptUrl("");
      onCaptureSuccess?.();

    } catch (error) {
      console.error('Erro ao capturar nota:', error);
      toast({
        title: "Erro",
        description: "Não foi possível salvar a nota. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsCapturing(false);
    }
  };

  return (
    <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
      <div className="space-y-2">
        <h3 className="font-medium">Capturar Nota Fiscal</h3>
        <p className="text-sm text-muted-foreground">
          Se você visualizou uma nota no navegador, cole a URL aqui para salvar uma captura completa:
        </p>
      </div>
      
      <div className="space-y-3">
        <input
          type="url"
          placeholder="Cole a URL da nota fiscal aqui..."
          value={receiptUrl}
          onChange={(e) => setReceiptUrl(e.target.value)}
          className="w-full px-3 py-2 border border-border rounded-md bg-background"
        />
        
        <Button
          onClick={handleCaptureNote}
          disabled={isCapturing || !receiptUrl.trim()}
          className="w-full"
          size="lg"
        >
          {isCapturing ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Capturando nota...
            </>
          ) : (
            <>
              <Camera className="w-4 h-4 mr-2" />
              Capturar e Salvar Nota
            </>
          )}
        </Button>
      </div>
      
      <div className="text-xs text-muted-foreground">
        💡 Dica: Após escanear um QR Code e visualizar a nota no navegador, 
        copie a URL e cole aqui para salvar uma imagem completa da nota.
      </div>
    </div>
  );
};

export default CaptureNoteButton;