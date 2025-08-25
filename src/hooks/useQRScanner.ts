import { useState } from "react";
import { toast } from "./use-toast";
import html2canvas from "html2canvas";

export const useQRScanner = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [lastScannedCode, setLastScannedCode] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const openScanner = () => setIsOpen(true);
  const closeScanner = () => setIsOpen(false);

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

  const captureAndSaveScreenshot = async (url: string) => {
    try {
      setIsProcessing(true);
      
      // Abre a URL em uma nova janela/aba
      const newWindow = window.open(url, '_blank');
      
      if (!newWindow) {
        throw new Error('Popup bloqueado. Permita popups para este site.');
      }

      // Aguarda um momento para a página carregar
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Captura screenshot da página atual (onde o QR code foi escaneado)
      const canvas = await html2canvas(document.body, {
        height: window.innerHeight,
        width: window.innerWidth,
        useCORS: true,
        scale: 0.5 // Reduz a escala para economizar espaço
      });

      // Converte para blob
      canvas.toBlob(async (blob) => {
        if (blob) {
          // Aqui você salvaria no banco de dados
          // Por enquanto, vamos simular salvando no localStorage
          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = reader.result as string;
            const screenshots = JSON.parse(localStorage.getItem('qr_screenshots') || '[]');
            screenshots.push({
              id: Date.now(),
              url: url,
              timestamp: new Date().toISOString(),
              screenshot: dataUrl
            });
            localStorage.setItem('qr_screenshots', JSON.stringify(screenshots));
            
            toast({
              title: "Screenshot salvo!",
              description: `Página ${url} capturada e salva com sucesso.`,
            });
          };
          reader.readAsDataURL(blob);
        }
      }, 'image/jpeg', 0.8);

    } catch (error) {
      console.error('Erro ao capturar screenshot:', error);
      toast({
        title: "Erro",
        description: "Não foi possível capturar a página. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleScanSuccess = async (result: string) => {
    setLastScannedCode(result);
    console.log("QR Code escaneado:", result);
    
    // Verifica se é uma URL válida
    if (isValidUrl(result)) {
      const formattedUrl = formatUrl(result);
      
      toast({
        title: "QR Code detectado!",
        description: `Abrindo: ${formattedUrl}`,
      });

      // Captura screenshot e abre a URL
      await captureAndSaveScreenshot(formattedUrl);
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
    isProcessing,
    openScanner,
    closeScanner,
    handleScanSuccess,
  };
};