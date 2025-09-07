import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, CheckCircle, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";

interface ConfirmacaoNotaDuvidosaProps {
  message: string;
  notaImagemId: string;
  onConfirmacao: (success: boolean) => void;
}

export const ConfirmacaoNotaDuvidosa = ({ 
  message, 
  notaImagemId, 
  onConfirmacao 
}: ConfirmacaoNotaDuvidosaProps) => {
  const [processando, setProcessando] = useState(false);
  const { toast } = useToast();

  const handleConfirmacao = async (confirmed: boolean) => {
    setProcessando(true);
    
    try {
      // Obter usuário atual
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('Usuário não autenticado');
      }

      const { data, error } = await supabase.functions.invoke('confirm-duvidosa-nota', {
        body: {
          notaImagemId,
          confirmed,
          userId: user.id
        }
      });

      if (error) {
        console.error('Erro na confirmação:', error);
        throw error;
      }

      if (confirmed) {
        toast({
          title: "✅ Nota processada",
          description: "Nota fiscal inserida com sucesso após sua confirmação.",
        });
      } else {
        toast({
          title: "❌ Nota rejeitada",
          description: "A nota foi descartada conforme solicitado.",
        });
      }

      onConfirmacao(true);
    } catch (error) {
      console.error('Erro ao processar confirmação:', error);
      toast({
        title: "Erro",
        description: "Ocorreu um erro ao processar sua decisão. Tente novamente.",
        variant: "destructive"
      });
      onConfirmacao(false);
    } finally {
      setProcessando(false);
    }
  };

  return (
    <div className="space-y-4 p-4 border rounded-lg bg-yellow-50 dark:bg-yellow-900/20">
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription className="text-sm">
          {message}
        </AlertDescription>
      </Alert>
      
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Button
          onClick={() => handleConfirmacao(true)}
          disabled={processando}
          className="bg-green-600 hover:bg-green-700 text-white"
        >
          <CheckCircle className="w-4 h-4 mr-2" />
          {processando ? 'Processando...' : 'SIM, inserir mesmo assim'}
        </Button>
        
        <Button
          onClick={() => handleConfirmacao(false)}
          disabled={processando}
          variant="destructive"
        >
          <XCircle className="w-4 h-4 mr-2" />
          NÃO, descartar nota
        </Button>
      </div>
    </div>
  );
};