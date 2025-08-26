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
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [useExternalBrowser, setUseExternalBrowser] = useState(false);
  const { user } = useAuth();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Configurar WebView otimizado para Receita Federal
  useEffect(() => {
    if (iframeRef.current && !useExternalBrowser) {
      const iframe = iframeRef.current;
      
      // Configurações avançadas do iframe para simular navegador nativo
      iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
      iframe.setAttribute('credentialless', 'false');
      
      // Timeout mais agressivo para detectar problemas da Receita
      const loadTimeout = setTimeout(() => {
        if (isLoading) {
          console.log('WebView travou na Receita Federal, forçando navegador externo');
          setLoadError(true);
          setUseExternalBrowser(false); // Permitir retry
        }
      }, 8000); // 8 segundos - mais rápido para Receita

      const handleLoad = () => {
        clearTimeout(loadTimeout);
        setIsLoading(false);
        setLoadError(false);
        
        // Injetar scripts para otimizar página da Receita
        try {
          const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
          if (iframeDoc) {
            // Meta viewport otimizado
            if (!iframeDoc.querySelector('meta[name="viewport"]')) {
              const metaViewport = iframeDoc.createElement('meta');
              metaViewport.name = 'viewport';
              metaViewport.content = 'width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes';
              iframeDoc.head?.appendChild(metaViewport);
            }
            
            // Forçar cookies e storage
            try {
              iframe.contentWindow?.localStorage.setItem('webview_test', 'enabled');
            } catch (e) {
              console.log('Storage não disponível no iframe');
            }
          }
        } catch (error) {
          console.log('Cross-origin restriction no iframe:', error);
          // Se não conseguir acessar, pode ser problema de CORS da Receita
          setTimeout(() => {
            if (isLoading) {
              setLoadError(true);
            }
          }, 3000);
        }
      };

      const handleError = () => {
        clearTimeout(loadTimeout);
        setLoadError(true);
        setIsLoading(false);
      };

      iframe.addEventListener('load', handleLoad);
      iframe.addEventListener('error', handleError);

      return () => {
        clearTimeout(loadTimeout);
        iframe.removeEventListener('load', handleLoad);
        iframe.removeEventListener('error', handleError);
      };
    }
  }, [isLoading, useExternalBrowser]);

  const openInExternalBrowser = async () => {
    try {
      if (Capacitor.isNativePlatform()) {
        await Browser.open({
          url: url,
          windowName: '_system',
          presentationStyle: 'fullscreen'
        });
        
        toast({
          title: "Nota aberta no navegador",
          description: "A nota foi aberta no navegador nativo. Volte para o app quando terminar.",
        });
        
        // Aguardar um tempo e depois fechar o viewer atual
        setTimeout(() => {
          onClose();
        }, 1000);
      } else {
        // No navegador web, abrir em nova aba
        window.open(url, '_blank');
        onClose();
      }
    } catch (error) {
      console.error('Erro ao abrir navegador externo:', error);
      toast({
        title: "Erro",
        description: "Não foi possível abrir o navegador externo.",
        variant: "destructive",
      });
    }
  };

  const retryInIframe = () => {
    setIsLoading(true);
    setLoadError(false);
    setUseExternalBrowser(false);
    
    // Forçar recarregamento do iframe
    if (iframeRef.current) {
      iframeRef.current.src = url;
    }
  };

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
      {/* Header with actions */}
      <div className="bg-background border-b p-4">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-semibold">Nota Fiscal</h2>
          <div className="flex items-center gap-2">
            {loadError && (
              <>
                <Button variant="outline" size="sm" onClick={retryInIframe}>
                  <RefreshCw className="w-4 h-4 mr-1" />
                  Tentar Novamente
                </Button>
                <Button variant="outline" size="sm" onClick={openInExternalBrowser}>
                  <ExternalLink className="w-4 h-4 mr-1" />
                  Abrir no Navegador
                </Button>
              </>
            )}
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
        
        {isLoading && (
          <div className="mt-2 flex items-center text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Carregando nota fiscal...
          </div>
        )}
        
        {loadError && (
          <div className="mt-2 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
            <p className="text-sm text-yellow-800">
              A nota não carregou corretamente no app. Tente recarregar ou abra no navegador externo para uma melhor experiência.
            </p>
          </div>
        )}
      </div>

      {/* Iframe container */}
      <div className="flex-1 overflow-hidden">
        {!useExternalBrowser ? (
          <iframe
            ref={iframeRef}
            src={url}
            className="w-full h-full border-0"
            title="Nota Fiscal - Receita Federal"
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-top-navigation allow-downloads allow-modals"
            allow="fullscreen; camera; microphone; geolocation; payment"
            referrerPolicy="strict-origin-when-cross-origin"
            loading="eager"
            style={{
              colorScheme: 'normal'
            }}
          />
        ) : (
          <div className="flex items-center justify-center h-full p-8">
            <div className="text-center space-y-4">
              <p className="text-muted-foreground">
                A nota foi aberta no navegador externo.
              </p>
              <Button onClick={onClose}>
                Voltar ao App
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Fixed bottom button */}
      <div className="bg-background border-t p-4">
        {!loadError ? (
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
        ) : (
          <div className="space-y-2">
            <Button
              onClick={openInExternalBrowser}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3"
              size="lg"
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              Abrir no Navegador Nativo
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              Para salvar a nota, abra-a no navegador e volte ao app
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReceiptViewer;