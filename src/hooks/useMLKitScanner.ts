import { useState } from "react";
import { toast } from "./use-toast";
import { Capacitor } from '@capacitor/core';
import { supabase } from "@/integrations/supabase/client";
import { BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';

export const useMLKitScanner = () => {
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
    const sefazPatterns = [
      /nfce\.fazenda\.rj\.gov\.br/i,
      /www4\.fazenda\.rj\.gov\.br.*nfce/i,
      /app\.fazenda\.rj\.gov\.br.*nfce/i,
      /nfce\.fazenda\.sp\.gov\.br/i,
      /www\.nfce\.fazenda\.sp\.gov\.br/i,
      /nfce\.fazenda\.mg\.gov\.br/i,
      /nfce\.sefaz\.rs\.gov\.br/i,
      /sistemas\.sefaz\.am\.gov\.br.*nfce/i,
      /fazenda\.[a-z]{2}\.gov\.br.*nfce/i,
      /sefaz\.[a-z]{2}\.gov\.br.*nfce/i,
      /[a-z]{2}\.fazenda\.gov\.br.*nfce/i,
    ];
    
    const hasNFCePattern = sefazPatterns.some(pattern => pattern.test(url));
    const urlObj = new URL(url);
    const hasChaveNFe = urlObj.searchParams.has('chNFe') || urlObj.searchParams.has('p');
    const hasNFCeKeyword = /nfce/i.test(url);
    
    if (hasNFCePattern || (hasChaveNFe && hasNFCeKeyword)) {
      console.log('✅ URL NFCe validada:', {
        url,
        hasPattern: hasNFCePattern,
        hasChave: hasChaveNFe,
        hasKeyword: hasNFCeKeyword
      });
      return true;
    }
    
    console.log('❌ URL NÃO é NFCe:', url);
    return false;
  };

  const handleScanSuccess = async (result: string) => {
    setLastScannedCode(result);
    console.log("🔍 QR Code escaneado (ML Kit nativo):", result);
    
    if (!isValidUrl(result)) {
      toast({
        title: "QR Code detectado",
        description: `Conteúdo: ${result}`,
      });
      return;
    }
    
    const formattedUrl = formatUrl(result);
    
    if (isReceiptUrl(formattedUrl)) {
      closeScanner();
      
      console.log("📄 NFCe detectada! Iniciando captura:", formattedUrl);
      
      toast({
        title: "📄 Nota Fiscal NFCe detectada!",
        description: "Processando automaticamente...",
        duration: 3000,
      });
      
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        
        if (authError || !user) {
          throw new Error('Usuário não autenticado. Faça login para processar notas.');
        }
        
        console.log("👤 Usuário autenticado:", user.id);
        console.log("🚀 Chamando edge function capture-receipt-external...");
        
        const { data, error } = await supabase.functions.invoke(
          'capture-receipt-external',
          {
            body: {
              receiptUrl: formattedUrl,
              userId: user.id
            }
          }
        );
        
        if (error) {
          console.error("❌ Erro da edge function:", error);
          throw error;
        }
        
        console.log("✅ Resposta da edge function:", data);
        
        toast({
          title: "✅ Nota capturada com sucesso!",
          description: "Processando dados automaticamente... Aguarde alguns segundos e atualize em 'Minhas Notas'.",
          duration: 8000,
        });
        
      } catch (error: any) {
        console.error('❌ Erro ao processar nota:', error);
        
        const errorMessage = error?.message || 
                           error?.error_description || 
                           "Não foi possível processar a nota. Tente novamente.";
        
        toast({
          title: "❌ Erro ao processar NFCe",
          description: errorMessage,
          variant: "destructive",
          duration: 6000,
        });
      }
      
    } else {
      toast({
        title: "🔗 Link detectado",
        description: `Abrindo: ${formattedUrl}`,
      });
      
      window.open(formattedUrl, '_blank');
    }
  };

  const startNativeScanner = async () => {
    if (!Capacitor.isNativePlatform()) {
      toast({
        title: "Erro",
        description: "Scanner ML Kit só funciona em dispositivos Android/iOS",
        variant: "destructive"
      });
      return;
    }

    try {
      console.log('🔍 Iniciando ML Kit Scanner oficial...');
      
      // Verificar/solicitar permissões
      const { camera } = await BarcodeScanner.checkPermissions();
      
      if (camera !== 'granted') {
        const { camera: newPermission } = await BarcodeScanner.requestPermissions();
        if (newPermission !== 'granted') {
          throw new Error('Permissão de câmera negada');
        }
      }
      
      toast({
        title: "📱 Abrindo Scanner ML Kit",
        description: "Aponte para o QR Code da NFCe",
        duration: 2000,
      });

      // Iniciar scan
      const { barcodes } = await BarcodeScanner.scan();

      if (barcodes && barcodes.length > 0) {
        const code = barcodes[0].rawValue;
        console.log('✅ QR Code detectado:', code);
        await handleScanSuccess(code);
      }
    } catch (error: any) {
      console.error('❌ Erro no scanner ML Kit:', error);
      
      if (!error?.message?.includes('cancel') && !error?.message?.includes('User cancelled')) {
        toast({
          title: "Erro no Scanner",
          description: error.message || "Falha ao escanear. Tente novamente.",
          variant: "destructive"
        });
      }
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
    startNativeScanner,
  };
};
