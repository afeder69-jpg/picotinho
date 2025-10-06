import { useState } from "react";
import { toast } from "./use-toast";
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { supabase } from "@/integrations/supabase/client";

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
    // Regex específicos para SEFAZ de diferentes estados
    const sefazPatterns = [
      // Rio de Janeiro - NFCe (PRIORITÁRIO)
      /nfce\.fazenda\.rj\.gov\.br/i,
      /www4\.fazenda\.rj\.gov\.br.*nfce/i,
      /app\.fazenda\.rj\.gov\.br.*nfce/i,
      
      // São Paulo
      /nfce\.fazenda\.sp\.gov\.br/i,
      /www\.nfce\.fazenda\.sp\.gov\.br/i,
      
      // Minas Gerais
      /nfce\.fazenda\.mg\.gov\.br/i,
      
      // Rio Grande do Sul
      /nfce\.sefaz\.rs\.gov\.br/i,
      
      // Amazonas
      /sistemas\.sefaz\.am\.gov\.br.*nfce/i,
      
      // Genérico - captura outros estados
      /fazenda\.[a-z]{2}\.gov\.br.*nfce/i,
      /sefaz\.[a-z]{2}\.gov\.br.*nfce/i,
      /[a-z]{2}\.fazenda\.gov\.br.*nfce/i,
    ];
    
    return sefazPatterns.some(pattern => pattern.test(url));
  };

  const handleScanSuccess = async (result: string) => {
    setLastScannedCode(result);
    console.log("🔍 QR Code escaneado:", result);
    
    // Verifica se é uma URL válida
    if (!isValidUrl(result)) {
      toast({
        title: "QR Code detectado",
        description: `Conteúdo: ${result}`,
      });
      return;
    }
    
    const formattedUrl = formatUrl(result);
    
    // Verifica se é uma nota fiscal da SEFAZ
    if (isReceiptUrl(formattedUrl)) {
      closeScanner();
      
      // 🔥 CAPTURA SILENCIOSA - sem abrir navegador
      console.log("📄 NFCe detectada! Iniciando captura silenciosa:", formattedUrl);
      
      toast({
        title: "📄 Nota Fiscal NFCe detectada!",
        description: "Processando automaticamente...",
        duration: 3000,
      });
      
      try {
        // Obter usuário autenticado
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        
        if (authError || !user) {
          throw new Error('Usuário não autenticado. Faça login para processar notas.');
        }
        
        console.log("👤 Usuário autenticado:", user.id);
        console.log("🚀 Chamando edge function capture-receipt-external...");
        
        // Chamar edge function para captura e processamento automático
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
        
        // Sucesso!
        toast({
          title: "✅ Nota capturada com sucesso!",
          description: "Processando dados automaticamente... Aguarde alguns segundos e atualize em 'Minhas Notas'.",
          duration: 8000,
        });
        
      } catch (error: any) {
        console.error('❌ Erro ao processar nota:', error);
        
        // Mensagem de erro mais clara
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
      // URL normal (não é nota fiscal) - abrir em nova aba
      toast({
        title: "🔗 Link detectado",
        description: `Abrindo: ${formattedUrl}`,
      });
      
      window.open(formattedUrl, '_blank');
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