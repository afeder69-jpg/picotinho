import { useState } from "react";
import { toast } from "./use-toast";
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';

export const useQRScanner = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [lastScannedCode, setLastScannedCode] = useState<string | null>(null);
  const [showReceiptViewer, setShowReceiptViewer] = useState(false);
  const [currentReceiptUrl, setCurrentReceiptUrl] = useState<string | null>(null);

  const openScanner = () => setIsOpen(true);
  const closeScanner = () => setIsOpen(false);
  
  const openReceiptViewer = (url: string) => {
    setCurrentReceiptUrl(url);
    setShowReceiptViewer(true);
  };
  
  const closeReceiptViewer = () => {
    setShowReceiptViewer(false);
    setCurrentReceiptUrl(null);
  };

  const isValidUrl = (string: string) => {
    try {
      new URL(string);
      return true;
    } catch (_) {
      // Se não é uma URL completa, tenta adicionar https://
      try {
        new URL(`https://${string}`);
        return true;
      } catch (_) {
        return false;
      }
    }
  };

  const formatUrl = (url: string) => {
    try {
      new URL(url);
      return url;
    } catch (_) {
      return `https://${url}`;
    }
  };

  const isReceiptUrl = (url: string) => {
    // Verifica se é uma URL da Receita Federal (NFCe ou NFe)
    return url.includes('fazenda.') || 
           url.includes('receita.') || 
           url.includes('sefaz.') ||
           url.includes('nfce') ||
           url.includes('nfe');
  };

  const handleScanSuccess = async (result: string) => {
    setLastScannedCode(result);
    console.log("QR Code escaneado:", result);
    
    // Verifica se é uma URL válida
    if (isValidUrl(result)) {
      const formattedUrl = formatUrl(result);
      
      // Verifica se é uma nota fiscal
      if (isReceiptUrl(formattedUrl)) {
        toast({
          title: "Nota Fiscal detectada!",
          description: "Abrindo no navegador para visualização...",
        });
        
        // Fecha o scanner e abre diretamente no navegador nativo
        closeScanner();
        
        // Abre direto no navegador nativo sem tela intermediária
        try {
          if (Capacitor.isNativePlatform()) {
            await Browser.open({
              url: formattedUrl,
              windowName: '_blank',
              presentationStyle: 'popover',
              toolbarColor: '#ffffff'
            });
            
            // Mostra instrução para o usuário
            toast({
              title: "📱 Nota aberta no navegador",
              description: "Após visualizar, volte ao app e acesse 'Minhas Notas' para salvar a captura",
              duration: 5000,
            });
          } else {
            window.open(formattedUrl, '_blank');
          }
        } catch (error) {
          console.error('Erro ao abrir navegador:', error);
          toast({
            title: "Erro",
            description: "Não foi possível abrir o navegador",
            variant: "destructive",
          });
        }
      } else {
        toast({
          title: "QR Code detectado!",
          description: `URL: ${formattedUrl}`,
        });
        
        // Para outras URLs, abre em nova aba
        window.open(formattedUrl, '_blank');
      }
    } else {
      toast({
        title: "QR Code detectado!",
        description: `Conteúdo: ${result}`,
      });
    }
  };

  return {
    isOpen,
    lastScannedCode,
    showReceiptViewer,
    currentReceiptUrl,
    openScanner,
    closeScanner,
    openReceiptViewer,
    closeReceiptViewer,
    handleScanSuccess,
  };
};