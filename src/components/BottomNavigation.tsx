import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Home, Menu, QrCode } from "lucide-react";
import ScreenCaptureComponent from "./ScreenCaptureComponent";
import QRCodeScanner from "./QRCodeScanner";
import QRCodeScannerWeb from "./QRCodeScannerWeb";
import InternalWebViewer from "./InternalWebViewer";
import CupomFiscalViewer from "./CupomFiscalViewer";
import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/components/auth/AuthProvider";
import { detectarTipoDocumento, TipoDocumento, extrairChaveNFe } from "@/lib/documentDetection";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { useProcessingNotes } from "@/contexts/ProcessingNotesContext";

const BottomNavigation = () => {
  const [showCaptureDialog, setShowCaptureDialog] = useState(false);
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [showCupomViewer, setShowCupomViewer] = useState(false);
  const [showInternalWebViewer, setShowInternalWebViewer] = useState(false);
  const [pendingQrUrl, setPendingQrUrl] = useState<string | null>(null);
  const [pendingDocType, setPendingDocType] = useState<TipoDocumento>(null);
  const [pendingNotaData, setPendingNotaData] = useState<any>(null);
  const [isProcessingQRCode, setIsProcessingQRCode] = useState(false);
  const { addProcessingNote, removeProcessingNote } = useProcessingNotes();
  const [processingNotesData, setProcessingNotesData] = useState<Map<string, { url: string, tipoDocumento: TipoDocumento }>>(new Map());
  const [processingTimers, setProcessingTimers] = useState<Map<string, NodeJS.Timeout>>(new Map());
  const [confirmedNotes, setConfirmedNotes] = useState<Set<string>>(new Set());
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const handleNoteConfirm = async () => {
    console.log('✅ [VIEWER] Nota confirmada, navegando para screenshots');
    
    // Marcar nota como confirmada para evitar reaberturas
    if (pendingNotaData?.id) {
      console.log('✅ [VIEWER] Adicionando nota às confirmadas:', pendingNotaData.id);
      setConfirmedNotes(prev => new Set(prev).add(pendingNotaData.id));
    }
    
    setShowInternalWebViewer(false);
    setShowCupomViewer(false);
    setPendingQrUrl(null);
    setPendingNotaData(null);
    navigate('/screenshots');
  };

  const handleNoteClose = () => {
    console.log('❌ [VIEWER] Viewer fechado');
    setShowInternalWebViewer(false);
    setShowCupomViewer(false);
    setPendingQrUrl(null);
    setPendingDocType(null);
  };


  const handleQRScanSuccess = async (data: string) => {
    console.log("QR Code escaneado:", data);
    
    // Validação de autenticação
    if (!user?.id) {
      console.error('❌ [AUTH] Usuário não identificado ao escanear QR');
      toast({
        title: "❌ Usuário não identificado",
        description: "Faça login para escanear notas fiscais",
        variant: "destructive",
      });
      setShowQRScanner(false);
      return;
    }
    
    console.log('👤 [AUTH] Usuário autenticado:', user.id);
    
    const urlPattern = /^https?:\/\/.+/i;
    
    if (!urlPattern.test(data)) {
      toast({
        title: "QR Code inválido",
        description: "Este não parece ser um QR Code de nota fiscal válido.",
        variant: "destructive",
      });
      setShowQRScanner(false);
      return;
    }
    
    // Detectar tipo de documento (NFe vs NFCe)
    const tipoDocumento = detectarTipoDocumento(data);
    console.log(`🔍 Tipo de documento: ${tipoDocumento || 'DESCONHECIDO'}`);
    
    // Fechar scanner imediatamente
    setShowQRScanner(false);
    
    try {
      const chaveAcesso = extrairChaveNFe(data);
      
      if (!chaveAcesso) {
        throw new Error('Não foi possível extrair a chave de acesso da URL');
      }
      
      console.log('🔑 Chave extraída:', chaveAcesso);
      
      // Chamar process-url-nota SEM AGUARDAR (processamento em background)
      const functionCall = supabase.functions.invoke('process-url-nota', {
        body: {
          url: data,
          userId: user.id,
          chaveAcesso,
          tipoDocumento,
        },
      });

      // Não aguardar o resultado, apenas registrar o ID temporário
      functionCall.then(({ data: processData, error: processError }) => {
        console.log('🔍 [DEBUG] Resposta da edge function:', processData);
        
        if (processError) {
          console.error('❌ Erro ao iniciar processamento:', processError);
          toast({
            title: "❌ Erro ao processar nota",
            description: processError.message || "Tente novamente",
            variant: "destructive",
          });
          return;
        }
        
        // Verificar possíveis nomes do campo
        const noteId = processData?.notaId || processData?.nota_id || processData?.id;
        
        if (noteId) {
          console.log('✅ [DEBUG] Adicionando nota ao processamento:', noteId);
          addProcessingNote(noteId);
          setProcessingNotesData(prev => new Map(prev).set(noteId, { url: data, tipoDocumento }));
          
          // Timeout de 2 minutos
          const timeoutId = setTimeout(() => {
            toast({
              title: "⏱️ Processamento demorado",
              description: "A nota está demorando mais que o esperado. Verifique em 'Minhas Notas'.",
              variant: "default",
            });
            removeProcessingNote(noteId);
            setProcessingTimers(prev => {
              const newMap = new Map(prev);
              newMap.delete(noteId);
              return newMap;
            });
          }, 120000); // 2 minutos
          
          setProcessingTimers(prev => new Map(prev).set(noteId, timeoutId));
        } else {
          console.error('❌ [DEBUG] notaId não encontrado na resposta:', processData);
        }
      });

      // Mostrar toast de processamento em background
      toast({
        title: "🔄 Processando nota",
        description: "Você pode continuar usando o app. Avisaremos quando estiver pronta!",
      });
      
    } catch (error: any) {
      console.error('❌ Erro ao processar nota:', error);
      toast({
        title: "❌ Erro ao processar nota",
        description: error.message || "Tente novamente",
        variant: "destructive",
      });
    }
  };

  // useEffect para escutar atualizações em tempo real das notas processadas
  useEffect(() => {
    if (!user?.id) return;

    console.log('🔔 [REALTIME] Configurando listener para notas processadas');
    console.log('👤 [REALTIME] User ID:', user.id);

    const channel = supabase
      .channel('notas-processadas')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notas_imagens',
          filter: `usuario_id=eq.${user.id}`,
        },
        async (payload) => {
          console.log('📨 [REALTIME] EVENTO RECEBIDO!', {
            event: payload.eventType,
            old: payload.old,
            new: payload.new,
            timestamp: new Date().toISOString()
          });
          
          const notaAtualizada = payload.new as any;
          
          console.log('🔍 [REALTIME] Verificando condições:', {
            id: notaAtualizada.id,
            processada: notaAtualizada.processada,
            tem_dados: !!notaAtualizada.dados_extraidos,
            usuario_id: notaAtualizada.usuario_id
          });
          
          // ✅ VALIDAÇÃO 1: Se o viewer já está aberto, ignorar
          if (showCupomViewer || showInternalWebViewer) {
            console.log('⚠️ [REALTIME] Viewer já está aberto, ignorando evento');
            return;
          }
          
          // ✅ VALIDAÇÃO 2: Se a nota já foi confirmada, ignorar
          if (confirmedNotes.has(notaAtualizada.id)) {
            console.log('⚠️ [REALTIME] Nota já foi confirmada, ignorando');
            return;
          }
          
          // ✅ VALIDAÇÃO 3: Se a nota não está mais sendo processada, ignorar
          if (!processingNotesData.has(notaAtualizada.id)) {
            console.log('⚠️ [REALTIME] Nota não está mais sendo processada, ignorando evento');
            return;
          }
          
          // Verificar se a nota foi processada
          if (notaAtualizada.processada && notaAtualizada.dados_extraidos) {
            console.log('✅ [REALTIME] Nota pronta:', notaAtualizada.id);
            
            // Remover do processamento
            removeProcessingNote(notaAtualizada.id);

            // Buscar dados completos da nota
            const { data: notaData, error: notaError } = await supabase
              .from('notas_imagens')
              .select('id, dados_extraidos, nome_original')
              .eq('id', notaAtualizada.id)
              .single();

            if (notaError) {
              console.error('❌ Erro ao buscar dados da nota:', notaError);
              return;
            }

            // Recuperar URL e tipo de documento do mapa local
            const notaInfo = processingNotesData.get(notaAtualizada.id);
            
            // ✅ FALLBACK INTELIGENTE
            if (!notaInfo) {
              console.warn('⚠️ Cache local não encontrado, abrindo viewer com fallback');
              
              toast({
                title: "✅ Nota pronta!",
                description: "Confira os dados e confirme para adicionar ao estoque",
              });
              
              if ('vibrate' in navigator) {
                navigator.vibrate([100, 50, 100]);
              }
              
              setPendingNotaData(notaData);
              setShowCupomViewer(true);
              
              // Cancelar timeout
              const timerId = processingTimers.get(notaAtualizada.id);
              if (timerId) {
                clearTimeout(timerId);
                setProcessingTimers(prev => {
                  const newMap = new Map(prev);
                  newMap.delete(notaAtualizada.id);
                  return newMap;
                });
              }
              
              return;
            }

            // Lógica normal com cache
            toast({
              title: "✅ Nota pronta!",
              description: "Confira os dados e confirme para adicionar ao estoque",
            });

            if ('vibrate' in navigator) {
              navigator.vibrate([100, 50, 100]);
            }

            setPendingQrUrl(notaInfo.url);
            setPendingDocType(notaInfo.tipoDocumento);
            setPendingNotaData(notaData);
            setShowCupomViewer(true);

            // Limpar do mapa local e cancelar timeout
            setProcessingNotesData(prev => {
              const newMap = new Map(prev);
              newMap.delete(notaAtualizada.id);
              return newMap;
            });
            
            const timerId = processingTimers.get(notaAtualizada.id);
            if (timerId) {
              clearTimeout(timerId);
              setProcessingTimers(prev => {
                const newMap = new Map(prev);
                newMap.delete(notaAtualizada.id);
                return newMap;
              });
            }
          }
        }
      )
      .subscribe((status) => {
        console.log('📡 [REALTIME] Status da subscrição:', status);
      });

    return () => {
      console.log('🔌 [REALTIME] Desconectando listener');
      supabase.removeChannel(channel);
    };
  }, [user?.id, processingNotesData, processingTimers, removeProcessingNote, showCupomViewer, showInternalWebViewer, confirmedNotes]);

  // useEffect para polling de fallback (verifica a cada 3 segundos)
  useEffect(() => {
    if (!user?.id) return;
    
    const processingNotesArray = Array.from(processingNotesData.keys());
    if (processingNotesArray.length === 0) return;

    const checkProcessedNotes = async () => {
      console.log('🔄 [POLLING] Verificando notas processadas...', processingNotesArray);
      
      // ✅ Se o viewer já está aberto, não verificar
      if (showCupomViewer || showInternalWebViewer) {
        console.log('⚠️ [POLLING] Viewer já está aberto, aguardando...');
        return;
      }
      
      for (const noteId of processingNotesArray) {
        const { data, error } = await supabase
          .from('notas_imagens')
          .select('id, processada, dados_extraidos, nome_original')
          .eq('id', noteId)
          .eq('usuario_id', user.id)
          .single();

        if (error) {
          console.error('❌ [POLLING] Erro ao verificar nota:', noteId, error);
          continue;
        }

        if (data?.processada && data?.dados_extraidos) {
          console.log('✅ [POLLING] Nota processada detectada via polling!', noteId);
          
          // ✅ Verificar se já foi confirmada
          if (confirmedNotes.has(noteId)) {
            console.log('⚠️ [POLLING] Nota já foi confirmada, ignorando');
            removeProcessingNote(noteId);
            continue;
          }
          
          toast({
            title: "✅ Nota pronta!",
            description: "Confira os dados e confirme para adicionar ao estoque",
          });
          
          if ('vibrate' in navigator) {
            navigator.vibrate([100, 50, 100]);
          }
          
          setPendingNotaData(data);
          setShowCupomViewer(true);
          removeProcessingNote(noteId);
          
          // Cancelar timeout
          const timerId = processingTimers.get(noteId);
          if (timerId) {
            clearTimeout(timerId);
            setProcessingTimers(prev => {
              const newMap = new Map(prev);
              newMap.delete(noteId);
              return newMap;
            });
          }

          // Limpar do mapa local
          setProcessingNotesData(prev => {
            const newMap = new Map(prev);
            newMap.delete(noteId);
            return newMap;
          });
        }
      }
    };

    // Verificar imediatamente
    checkProcessedNotes();
    
    // Verificar a cada 3 segundos
    const interval = setInterval(checkProcessedNotes, 3000);

    return () => clearInterval(interval);
  }, [user?.id, processingNotesData, processingTimers, removeProcessingNote, showCupomViewer, showInternalWebViewer, confirmedNotes]);

  const handleQRButtonClick = () => {
    console.log('🔘 Botão QR Code clicado');
    console.log('📱 Plataforma:', Capacitor.getPlatform());
    console.log('🏠 Nativo?', Capacitor.isNativePlatform());
    setShowQRScanner(true);
  };

  return (
    <>
      {/* Botões flutuantes fixos */}
      <div className="fixed bottom-0 left-0 right-0 z-50 pointer-events-none">
        <div className="flex justify-between items-end w-full max-w-screen-lg mx-auto p-4 safe-area-inset-bottom">
          {/* Botão Início - sempre presente no canto esquerdo */}
          <Button
            variant="default"
            size="lg"
            className="flex-col h-16 w-16 rounded-full bg-green-600 hover:bg-green-700 text-white shadow-lg pointer-events-auto"
            onClick={() => navigate('/')}
          >
            <Home className="w-6 h-6" />
          </Button>
          
          {/* Botão Escanear QR - Funcional em todas as plataformas */}
          {location.pathname === '/' && (
            <Button
              variant="default"
              size="lg"
              className="flex-col h-20 w-20 rounded-full bg-green-600 hover:bg-green-700 text-white shadow-lg pointer-events-auto"
              onClick={handleQRButtonClick}
            >
              <QrCode className="w-8 h-8" />
            </Button>
          )}
          
          {/* Botão Menu - sempre presente no canto direito */}
          <Button
            variant="default"
            size="lg"
            className="flex-col h-16 w-16 rounded-full bg-green-600 hover:bg-green-700 text-white shadow-lg pointer-events-auto"
            onClick={() => navigate('/menu')}
          >
            <Menu className="w-6 h-6" />
          </Button>
        </div>
      </div>
      
      {/* Dialog para captura de tela */}
      {showCaptureDialog && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card p-6 rounded-lg shadow-lg w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Capturar Nota Fiscal</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowCaptureDialog(false)}
              >
                ×
              </Button>
            </div>
            <ScreenCaptureComponent />
          </div>
        </div>
      )}

      {/* QR Code Scanner - Nativo ou Web dependendo da plataforma */}
      {showQRScanner && (
        Capacitor.isNativePlatform() ? (
          <QRCodeScanner
            onScanSuccess={handleQRScanSuccess}
            onClose={() => setShowQRScanner(false)}
          />
        ) : (
          <QRCodeScannerWeb
            onScanSuccess={handleQRScanSuccess}
            onClose={() => setShowQRScanner(false)}
          />
        )
      )}

      {/* Fallback: Se não estiver autenticado, mostrar modal de login */}
      {showInternalWebViewer && pendingQrUrl && !user?.id && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="max-w-md">
            <CardHeader>
              <CardTitle>Login Necessário</CardTitle>
            </CardHeader>
            <CardContent>
              <p>Você precisa estar logado para processar notas fiscais.</p>
              <Button onClick={() => navigate('/auth')} className="mt-4 w-full">
                Fazer Login
              </Button>
            </CardContent>
          </Card>
        </div>
      )}


      {/* Cupom Fiscal Viewer (Nativo - NFe/NFCe) */}
      {showCupomViewer && pendingNotaData && user?.id && (
        <CupomFiscalViewer
          notaId={pendingNotaData.id}
          dadosExtraidos={pendingNotaData.dados_extraidos}
          userId={user.id}
          isOpen={showCupomViewer}
          onClose={handleNoteClose}
          onConfirm={handleNoteConfirm}
        />
      )}

      {/* Internal Web Viewer com API Serpro (NFe - Web only) */}
      {showInternalWebViewer && pendingQrUrl && user?.id && (
        <InternalWebViewer
          url={pendingQrUrl}
          isOpen={showInternalWebViewer}
          onClose={handleNoteClose}
          onConfirm={handleNoteConfirm}
          userId={user.id}
        />
      )}
    </>
  );
};

export default BottomNavigation;