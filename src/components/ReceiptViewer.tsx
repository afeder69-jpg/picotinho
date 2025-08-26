import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Check, X, Loader2, ExternalLink, RefreshCw } from "lucide-react";
import html2canvas from "html2canvas";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';

interface ReceiptViewerProps {
  url: string;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

const ReceiptViewer = ({ url, isOpen, onClose, onConfirm }: ReceiptViewerProps) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const { user } = useAuth();

  // Abrir automaticamente no navegador nativo quando modal abrir
  useEffect(() => {
    if (isOpen && url) {
      openInExternalBrowser();
    }
  }, [isOpen, url]);

  // Iniciar captura automática em background
  const startBackgroundCapture = async () => {
    if (!user) return;
    
    try {
      // Chama edge function para capturar a nota automaticamente
      const { data, error } = await supabase.functions.invoke('capture-receipt-external', {
        body: {
          receiptUrl: url,
          userId: user.id
        }
      });
      
      if (error) {
        console.error('Erro ao iniciar captura automática:', error);
      } else {
        console.log('Captura automática iniciada:', data);
      }
    } catch (error) {
      console.error('Erro na captura automática:', error);
    }
  };
  
  // Verificar status da captura
  const checkCaptureStatus = async () => {
    if (!user) return;
    
    try {
      // Buscar notas recentes do usuário para verificar se foi salva
      const { data: recentNotes } = await supabase
        .from('notas_imagens')
        .select('*')
        .eq('usuario_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1);
      
      if (recentNotes && recentNotes.length > 0) {
        const lastNote = recentNotes[0];
        const noteTime = new Date(lastNote.created_at).getTime();
        const nowTime = Date.now();
        
        // Se a nota foi criada nos últimos 5 minutos
        if (nowTime - noteTime < 5 * 60 * 1000) {
          toast({
            title: "Nota salva automaticamente!",
            description: "A nota fiscal foi capturada e salva no seu perfil.",
          });
          onConfirm();
        }
      }
    } catch (error) {
      console.error('Erro ao verificar status da captura:', error);
    }
  };

  const openInExternalBrowser = async () => {
    try {
      setIsCapturing(true);
      
      // Primeiro, iniciar processo de captura em background
      await startBackgroundCapture();
      
      if (Capacitor.isNativePlatform()) {
        // Chrome Custom Tabs (Android) ou Safari View Controller (iOS)
        await Browser.open({
          url: url,
          windowName: '_blank',
          presentationStyle: 'popover',
          toolbarColor: '#ffffff'
        });
        
        // Listener para quando o navegador fechar
        Browser.addListener('browserFinished', () => {
          console.log('Navegador externo fechado - verificando captura');
          setIsCapturing(false);
          checkCaptureStatus();
        });
        
      } else {
        // No web, abrir em nova aba
        window.open(url, '_blank');
        // Verificar captura após alguns segundos
        setTimeout(() => {
          setIsCapturing(false);
          checkCaptureStatus();
        }, 10000);
      }
      
      toast({
        title: "Nota aberta no navegador",
        description: "Aguarde a página carregar completamente e toque em 'Confirmar Nota'",
      });
      
    } catch (error) {
      console.error('Erro ao abrir navegador externo:', error);
      setIsCapturing(false);
      toast({
        title: "Erro",
        description: "Não foi possível abrir o navegador externo.",
        variant: "destructive",
      });
    }
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
      
      // Usar a edge function para capturar e salvar a nota
      const { data, error } = await supabase.functions.invoke('capture-receipt-external', {
        body: {
          receiptUrl: url,
          userId: user.id
        }
      });
      
      if (error) throw error;
      
      toast({
        title: "📸 Nota capturada com sucesso!",
        description: "A imagem da nota foi salva e aparecerá em 'Minhas Notas'.",
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
      {/* Header with actions */}
      <div className="bg-background border-b p-4">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-semibold">Nota Fiscal</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
        
        {isCapturing && (
          <div className="mt-2 flex items-center text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Aguardando carregamento da página...
          </div>
        )}
      </div>

      {/* Main content */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center space-y-6 max-w-md">
          <div className="space-y-2">
            <ExternalLink className="w-12 h-12 mx-auto text-primary" />
            <h3 className="text-lg font-semibold">Nota aberta no navegador</h3>
            <p className="text-muted-foreground text-sm">
              A nota fiscal foi aberta no navegador nativo. Aguarde a página carregar completamente e depois toque no botão abaixo para capturar e salvar a imagem da nota.
            </p>
          </div>
          
          <div className="p-4 bg-muted rounded-lg">
            <p className="text-sm font-medium mb-2">📋 Como funciona:</p>
            <ol className="text-xs text-muted-foreground space-y-1 text-left">
              <li>✅ 1. Nota aberta no navegador</li>
              <li>⏱️ 2. Aguarde carregamento completo</li>
              <li>📸 3. Toque "Confirmar" para capturar</li>
              <li>💾 4. Imagem salva em "Minhas Notas"</li>
            </ol>
          </div>
          
          {isCapturing && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-700">
                🤖 Sistema capturando imagem da nota automaticamente...
              </p>
            </div>
          )}
        </div>
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
              Capturando nota...
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