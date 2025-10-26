import { useState } from 'react';
import { Browser } from '@capacitor/browser';
import { Button } from '@/components/ui/button';
import { Check, X, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface NFCeWebViewerProps {
  url: string;
  userId: string;
  isOpen: boolean;
  onClose: () => void;
  onConfirm?: () => void;
}

export function NFCeWebViewer({ url, userId, isOpen, onClose, onConfirm }: NFCeWebViewerProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();

  const handleOpenWebView = async () => {
    try {
      console.log('🌐 [WEBVIEW] Abrindo URL da NFCe:', url);
      
      await Browser.open({ 
        url,
        presentationStyle: 'popover',
        toolbarColor: '#10b981', // verde
      });
      
      console.log('✅ [WEBVIEW] WebView aberto com sucesso');
    } catch (error) {
      console.error('❌ [WEBVIEW] Erro ao abrir:', error);
      toast({
        title: "Erro",
        description: "Não foi possível abrir a nota fiscal",
        variant: "destructive"
      });
    }
  };

  const handleConfirm = async () => {
    setIsProcessing(true);
    
    try {
      console.log('✅ [WEBVIEW] Usuário confirmou processamento');
      console.log('📡 [API] Chamando process-url-nota...');
      
      // Fechar o browser primeiro
      await Browser.close();
      
      // Processar a nota fiscal via Edge Function
      const { data, error } = await supabase.functions.invoke('process-url-nota', {
        body: {
          url,
          userId
        }
      });

      if (error) {
        console.error('❌ [SERPRO] Erro ao processar:', error);
        throw error;
      }

      console.log('✅ [SUCESSO] Nota processada:', data);
      
      toast({
        title: "✅ Nota fiscal processada!",
        description: "Produtos adicionados ao estoque",
      });

      // Callback de sucesso
      if (onConfirm) {
        onConfirm();
      }
      
      onClose();
    } catch (error) {
      console.error('❌ [ERROR] Falha no processamento:', error);
      
      toast({
        title: "❌ Erro ao processar nota",
        description: "Não foi possível processar a nota fiscal. Tente novamente.",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancel = async () => {
    console.log('❌ [WEBVIEW] Usuário cancelou');
    
    try {
      await Browser.close();
    } catch (error) {
      // Ignorar erro se o browser já estiver fechado
    }
    
    toast({
      title: "Cancelado",
      description: "Nota fiscal descartada",
    });
    
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ExternalLink className="h-5 w-5 text-primary" />
            Nota Fiscal Eletrônica
          </CardTitle>
          <CardDescription>
            Visualize a nota fiscal no site da SEFAZ e confirme o processamento
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-muted p-4 rounded-lg">
            <p className="text-sm text-muted-foreground mb-2">
              A nota fiscal será aberta em uma janela interna do aplicativo.
            </p>
            <p className="text-sm font-medium">
              Após visualizar, confirme para adicionar os produtos ao seu estoque.
            </p>
          </div>

          <div className="space-y-2">
            <Button
              onClick={handleOpenWebView}
              className="w-full"
              size="lg"
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Visualizar Nota Fiscal
            </Button>

            <div className="flex gap-2">
              <Button
                onClick={handleCancel}
                variant="outline"
                className="flex-1"
                disabled={isProcessing}
              >
                <X className="mr-2 h-4 w-4" />
                Cancelar
              </Button>

              <Button
                onClick={handleConfirm}
                className="flex-1 bg-green-600 hover:bg-green-700"
                disabled={isProcessing}
              >
                <Check className="mr-2 h-4 w-4" />
                {isProcessing ? 'Processando...' : 'Confirmar'}
              </Button>
            </div>
          </div>

          <p className="text-xs text-muted-foreground text-center">
            ⚠️ Se aparecer uma tela cinza, confirme mesmo assim. Estamos trabalhando com a SEFAZ para resolver.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
