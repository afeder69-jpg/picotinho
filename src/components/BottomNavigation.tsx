/**
 * 🧭 COMPONENTE DE NAVEGAÇÃO INFERIOR
 * 
 * Este componente gerencia:
 * 1. Navegação principal (Home, QR Code, Menu)
 * 2. Scanner de QR Code (nativo ou web)
 * 3. FLUXO AUTOMÁTICO de processamento de notas fiscais
 * 
 * 🔄 FLUXO AUTOMÁTICO DE PROCESSAMENTO (REALTIME):
 * 
 * 1. Usuário escaneia QR Code → handleQRScanSuccess()
 * 2. → Enfileira na fila (useNoteQueue)
 * 3. → Fila dispara executeNoteProcessing() (1 por vez)
 * 4. → Chama process-url-nota (edge function)
 * 5. → Extração automática via InfoSimples/Serpro
 * 6. → Realtime listener detecta dados_extraidos preenchido
 * 7. → processarNotaAutomaticamente() AUTOMÁTICO
 * 8. → Gera PDF → valida → processa estoque
 * 
 * ⚠️ NÃO HÁ CONFIRMAÇÃO MANUAL
 * Todo o pipeline é 100% automático após scan do QR Code.
 */
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Home, Menu, QrCode } from "lucide-react";
import ScreenCaptureComponent from "./ScreenCaptureComponent";
import QRCodeScanner from "./QRCodeScanner";
import QRCodeScannerWeb from "./QRCodeScannerWeb";
import InternalWebViewer from "./InternalWebViewer";
import CupomFiscalViewer from "./CupomFiscalViewer";
import { ProcessingBadge } from "./ProcessingBadge";
import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/components/auth/AuthProvider";
import { detectarTipoDocumento, TipoDocumento, extrairChaveNFe, construirUrlConsulta } from "@/lib/documentDetection";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { useProcessingNotes } from "@/contexts/ProcessingNotesContext";
import { useNoteQueue } from "@/hooks/useNoteQueue";
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

/**
 * Verifica se dados_extraidos contém dados REAIS de extração (itens, estabelecimento, valor),
 * e não apenas metadados iniciais inseridos pelo process-url-nota (chave_acesso, uf, modelo).
 * Critério: itens/produtos com length > 0 E (nome do estabelecimento OU valor total > 0).
 */
const temDadosReaisExtraidos = (dados: any): boolean => {
  if (!dados) return false;
  const temItens = (Array.isArray(dados.itens) && dados.itens.length > 0) ||
                   (Array.isArray(dados.produtos) && dados.produtos.length > 0);
  if (!temItens) return false;
  const temEstabelecimento = !!(dados.estabelecimento?.nome || dados.emitente?.nome);
  const temValor = (dados.compra?.valor_total > 0) || (dados.valor_total > 0);
  return temEstabelecimento || temValor;
};

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
  const activelyProcessingRef = useRef<Set<string>>(new Set());
  
  // 🔵 Map queueItemId → notaId real para markDone/markError
  const queueToNotaIdRef = useRef<Map<string, string>>(new Map());
  // Map notaId → queueItemId para lookup reverso (Realtime/polling)
  const notaIdToQueueRef = useRef<Map<string, string>>(new Map());
  
  // Refs para evitar reconexão do Realtime quando esses states mudam
  const processingNotesDataRef = useRef(processingNotesData);
  const processingTimersRef = useRef(processingTimers);
  const confirmedNotesRef = useRef(confirmedNotes);
  const showCupomViewerRef = useRef(showCupomViewer);
  const showInternalWebViewerRef = useRef(showInternalWebViewer);

  // Manter refs sincronizadas com os states
  useEffect(() => { processingNotesDataRef.current = processingNotesData; }, [processingNotesData]);
  useEffect(() => { processingTimersRef.current = processingTimers; }, [processingTimers]);
  useEffect(() => { confirmedNotesRef.current = confirmedNotes; }, [confirmedNotes]);
  useEffect(() => { showCupomViewerRef.current = showCupomViewer; }, [showCupomViewer]);
  useEffect(() => { showInternalWebViewerRef.current = showInternalWebViewer; }, [showInternalWebViewer]);

  // Listen for open-scanner event from other pages
  useEffect(() => {
    const handleOpenScanner = () => setShowQRScanner(true);
    window.addEventListener('open-scanner', handleOpenScanner);
    return () => window.removeEventListener('open-scanner', handleOpenScanner);
  }, []);

  // 🔵 Sub-fase D: notifica o GlobalProcessingIndicator quando o scanner está ATIVO
  // (única exceção em que o indicador global é ocultado).
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('scanner-active', { detail: showQRScanner }));
  }, [showQRScanner]);
  const debounceTimerRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const lastProcessingTimestamp = useRef<Map<string, number>>(new Map());
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  // Sub-fase C: rastrear última navegação manual do usuário
  // (usado para guardar a navegação automática para /screenshots)
  const lastUserNavigationAt = useRef<number>(Date.now());
  useEffect(() => {
    lastUserNavigationAt.current = Date.now();
  }, [location.pathname]);

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

  // 🔵 Refs para queue callbacks (evita dependência circular)
  const queueMarkDoneRef = useRef<(id: string) => void>(() => {});
  const queueMarkErrorRef = useRef<(id: string, msg?: string) => void>(() => {});

  /**
   * 🔵 EXECUTOR REAL DE PROCESSAMENTO DE NOTA
   * Esta é a função original handleQRScanSuccess, agora chamada pela fila.
   * Toda a lógica interna permanece INTACTA.
   */
  const executeNoteProcessing = useCallback(async (urlParaProcessar: string, chaveAcesso: string, tipoDocumento: TipoDocumento, queueItemId: string) => {
    console.log("🔵 [QUEUE] Executando processamento para:", queueItemId);
    
    // Validação de autenticação
    if (!user?.id) {
      console.error('❌ [AUTH] Usuário não identificado ao processar nota');
      toast({
        title: "❌ Usuário não identificado",
        description: "Faça login para escanear notas fiscais",
        variant: "destructive",
      });
      queueMarkErrorRef.current(queueItemId, 'Usuário não autenticado');
      return;
    }
    
    console.log('👤 [AUTH] Usuário autenticado:', user.id);
    
    try {
      console.log('🔑 Chave:', chaveAcesso);
      
      // 🆕 GERAR ID TEMPORÁRIO IMEDIATAMENTE
      const tempId = `temp-${Date.now()}`;
      console.log('🔵 [BADGE] Adicionando nota temporária:', tempId);
      addProcessingNote(tempId);
      setProcessingNotesData(prev => new Map(prev).set(tempId, { url: urlParaProcessar, tipoDocumento }));
      
      // Registrar vínculo queueItemId para este processamento
      queueToNotaIdRef.current.set(queueItemId, tempId);
      
      // Chamar process-url-nota SEM AGUARDAR (processamento em background)
      const functionCall = supabase.functions.invoke('process-url-nota', {
        body: {
          url: urlParaProcessar,
          userId: user.id,
          chaveAcesso,
          tipoDocumento,
        },
      });

      // Quando resposta chegar, substituir ID temporário pelo real
      functionCall.then(async ({ data: processData, error: processError }) => {
        console.log('🔍 [DEBUG] Resposta da edge function:', processData, 'erro:', processError);
        
        // 🔒 Verificar nota duplicada — pode vir em processData (body parseado) ou processError (FunctionsHttpError)
        let isDuplicada = processData?.error === 'NOTA_DUPLICADA';
        let duplicadaMessage = processData?.message;
        
        if (!isDuplicada && processError) {
          // O SDK Supabase coloca 4xx/5xx como FunctionsHttpError — tentar extrair o body
          try {
            // Tentativa 1: context.body (string ou objeto)
            const errorContext = (processError as any)?.context;
            if (errorContext?.body) {
              const parsed = typeof errorContext.body === 'string' ? JSON.parse(errorContext.body) : errorContext.body;
              if (parsed?.error === 'NOTA_DUPLICADA') {
                isDuplicada = true;
                duplicadaMessage = parsed?.message;
              }
            }
            // Tentativa 2: context.json() (algumas versões do SDK)
            if (!isDuplicada && errorContext?.json) {
              try {
                const jsonBody = await errorContext.json();
                if (jsonBody?.error === 'NOTA_DUPLICADA') {
                  isDuplicada = true;
                  duplicadaMessage = jsonBody?.message;
                }
              } catch (_inner) { /* ignorar */ }
            }
          } catch (_) {
            // Tentativa 3: verificar a mensagem crua
            if (processError.message?.includes('NOTA_DUPLICADA')) {
              isDuplicada = true;
            }
          }
        }
        
        if (isDuplicada) {
          console.log('🚫 Nota duplicada detectada');
          removeProcessingNote(tempId);
          setProcessingNotesData(prev => {
            const newMap = new Map(prev);
            newMap.delete(tempId);
            return newMap;
          });
          toast({
            title: "🚫 Nota já lançada",
            description: duplicadaMessage || "Essa nota fiscal já foi lançada no Picotinho e não pode ser enviada novamente.",
            variant: "destructive",
          });
          queueMarkErrorRef.current(queueItemId, 'Nota já lançada no Picotinho');
          return;
        }
        
        if (processError) {
          console.error('❌ Erro ao iniciar processamento:', processError);
          removeProcessingNote(tempId);
          setProcessingNotesData(prev => {
            const newMap = new Map(prev);
            newMap.delete(tempId);
            return newMap;
          });

          // Tentar extrair body estruturado do erro (FunctionsHttpError)
          let errorCode = '';
          let errorMessage = '';
          let errorReason = '';
          try {
            const ctx = (processError as any).context;
            if (ctx) {
              const body = typeof ctx.body === 'string' ? JSON.parse(ctx.body) : (typeof ctx.json === 'function' ? await ctx.json() : null);
              if (body) {
                errorCode = body.error || '';
                errorMessage = body.message || '';
                errorReason = body.reason || '';
              }
            }
          } catch (_) { /* ignore parse errors */ }

          // Mensagem específica para falha definitiva de extração
          if (errorCode === 'EXTRACAO_FALHOU') {
            if (errorReason === 'SEFAZ_INSTAVEL') {
              toast({
                title: "⏳ Consulta indisponível no momento",
                description: "Estamos com uma instabilidade na SEFAZ para consultar essa nota agora. Pode aguardar alguns minutos e tentar novamente — normalmente isso se resolve rápido. Se preferir, você pode tentar mais tarde também. Seus dados estão seguros 👍",
                duration: 9000,
              });
              queueMarkErrorRef.current(queueItemId, 'SEFAZ instável');
              return;
            }
            const msg = errorMessage || 'Não conseguimos ler esta nota agora. Tente novamente em instantes.';
            toast({
              title: "⚠️ Não foi possível ler a nota",
              description: msg,
              duration: 8000,
            });
            queueMarkErrorRef.current(queueItemId, msg);
            return;
          }

          // Nunca exibir mensagem genérica do SDK em inglês para o usuário
          const rawMsg = processError.message || '';
          const isGenericSdkError = rawMsg.includes('non-2xx') || rawMsg.includes('Edge Function') || rawMsg.includes('FunctionsHttpError');
          const userMessage = isGenericSdkError 
            ? 'Erro ao processar nota fiscal. Tente novamente.' 
            : rawMsg || 'Tente novamente';
          toast({
            title: "❌ Erro ao processar nota",
            description: userMessage,
            variant: "destructive",
          });
          queueMarkErrorRef.current(queueItemId, userMessage);
          return;
        }
        
        // Verificar possíveis nomes do campo
        const noteId = processData?.notaId || processData?.nota_id || processData?.id;
        
        if (noteId) {
          console.log('✅ [DEBUG] Substituindo tempId por notaId real:', tempId, '->', noteId);
          
          // Remover ID temporário
          removeProcessingNote(tempId);
          setProcessingNotesData(prev => {
            const newMap = new Map(prev);
            newMap.delete(tempId);
            return newMap;
          });
          
          // Adicionar ID real
          addProcessingNote(noteId);
          setProcessingNotesData(prev => new Map(prev).set(noteId, { url: urlParaProcessar, tipoDocumento }));
          
          // 🔵 Atualizar vínculos com o notaId real
          queueToNotaIdRef.current.set(queueItemId, noteId);
          notaIdToQueueRef.current.set(noteId, queueItemId);
          
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
            // 🔵 Marcar erro na fila por timeout
            queueMarkErrorRef.current(queueItemId, 'Timeout');
          }, 120000); // 2 minutos
          
          setProcessingTimers(prev => new Map(prev).set(noteId, timeoutId));
        } else {
          console.error('❌ [DEBUG] notaId não encontrado na resposta:', processData);
          // Remover ID temporário se não houver noteId
          removeProcessingNote(tempId);
          setProcessingNotesData(prev => {
            const newMap = new Map(prev);
            newMap.delete(tempId);
            return newMap;
          });
          // 🔵 Marcar erro na fila
          queueMarkErrorRef.current(queueItemId, 'notaId não retornado');
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
      // 🔵 Marcar erro na fila → libera a próxima
      queueMarkErrorRef.current(queueItemId, error.message);
    }
  }, [user?.id, addProcessingNote, removeProcessingNote]);

  // 🔵 HOOK DE FILA - wrapper sobre executeNoteProcessing
  const noteQueue = useNoteQueue({
    processNote: executeNoteProcessing,
  });

  // Sincronizar refs com callbacks reais do hook
  useEffect(() => {
    queueMarkDoneRef.current = noteQueue.markDone;
    queueMarkErrorRef.current = noteQueue.markError;
  }, [noteQueue.markDone, noteQueue.markError]);

  /**
   * 🔵 Handler de scan do QR Code - agora enfileira em vez de executar direto
   */
  const handleQRScanSuccess = async (data: string) => {
    console.log("QR Code escaneado:", data);
    
    // Validação de autenticação
    if (!user?.id) {
      toast({
        title: "❌ Usuário não identificado",
        description: "Faça login para escanear notas fiscais",
        variant: "destructive",
      });
      setShowQRScanner(false);
      return;
    }
    
    // Normalizar dados do QR Code: aceitar URL ou extrair chave de formatos não-URL
    let urlParaProcessar = data;
    const urlPattern = /^https?:\/\/.+/i;
    
    if (!urlPattern.test(data)) {
      const chaveExtraida = extrairChaveNFe(data);
      if (chaveExtraida) {
        urlParaProcessar = construirUrlConsulta(chaveExtraida);
        console.log('🔑 Chave extraída de QR Code não-URL:', chaveExtraida, '→', urlParaProcessar);
      } else {
        toast({
          title: "QR Code inválido",
          description: "Não foi possível identificar uma nota fiscal neste QR Code.",
          variant: "destructive",
        });
        setShowQRScanner(false);
        return;
      }
    }
    
    // Detectar tipo de documento (NFe vs NFCe)
    const tipoDocumento = detectarTipoDocumento(urlParaProcessar);
    console.log(`🔍 Tipo de documento: ${tipoDocumento || 'DESCONHECIDO'}`);
    
    // Fechar scanner imediatamente
    setShowQRScanner(false);
    
    // Extrair chave
    const chaveAcesso = extrairChaveNFe(urlParaProcessar);
    if (!chaveAcesso) {
      toast({
        title: "❌ Erro",
        description: "Não foi possível extrair a chave de acesso da URL",
        variant: "destructive",
      });
      return;
    }
    
    // 🔵 ENFILEIRAR em vez de executar diretamente
    noteQueue.enqueue(urlParaProcessar, chaveAcesso, tipoDocumento);
  };

  /**
   * 🔵 Helper: marcar conclusão na fila a partir de um notaId real
   */
  const markQueueDoneByNotaId = (notaId: string) => {
    const queueItemId = notaIdToQueueRef.current.get(notaId);
    if (queueItemId) {
      queueMarkDoneRef.current(queueItemId);
      // Cleanup refs
      notaIdToQueueRef.current.delete(notaId);
      queueToNotaIdRef.current.delete(queueItemId);
    }
  };

  const markQueueErrorByNotaId = (notaId: string, msg?: string) => {
    const queueItemId = notaIdToQueueRef.current.get(notaId);
    if (queueItemId) {
      queueMarkErrorRef.current(queueItemId, msg);
      notaIdToQueueRef.current.delete(notaId);
      queueToNotaIdRef.current.delete(queueItemId);
    }
  };


  /**
   * 🤖 PROCESSAMENTO AUTOMÁTICO DE NOTAS FISCAIS — MODO OBSERVADOR (Sub-fase C)
   *
   * MUDANÇA Sub-fase C: O frontend NÃO dispara mais `validate-receipt` nem
   * `process-receipt-full` no caminho automático. A finalização agora roda
   * 100% no servidor via `finalize-nota-estoque` (acionado por
   * `process-nfe-infosimples` / `process-nfce-infosimples` ou pelo cron
   * `retry-notas-pendentes`).
   *
   * O frontend apenas:
   *  - Marca a nota como "em observação" (guards anti-duplicação preservados).
   *  - Aguarda o realtime/polling entregar `status_processamento = 'processada'`
   *    para então fazer markQueueDoneByNotaId + toast + navegação conservadora.
   *  - Em caso de `status_processamento = 'erro'`, marca a fila com erro.
   *
   * Os caminhos legados (gerarPDFBackground, validate-receipt invoke,
   * process-receipt-full invoke, delete de rejeitada) NÃO foram removidos do
   * arquivo nesta sub-fase — ficam para uma limpeza posterior (Sub-fase D).
   */
  const processarNotaAutomaticamente = async (
    notaId: string,
    _userId: string,
    _notaData: any
  ) => {
    // ✅ GUARD 1: Evitar registro duplicado na observação
    if (activelyProcessingRef.current.has(notaId)) {
      console.log(`⚠️ [AUTO-OBSERVER] Nota ${notaId} já está sob observação, ignorando...`);
      return;
    }

    // ✅ GUARD 2: Throttle 30s
    const lastProcessing = lastProcessingTimestamp.current.get(notaId) || 0;
    const agora = Date.now();
    if (agora - lastProcessing < 30000) {
      console.log(`⚠️ [AUTO-OBSERVER] Nota ${notaId} observada recentemente, ignorando...`);
      return;
    }

    activelyProcessingRef.current.add(notaId);
    lastProcessingTimestamp.current.set(notaId, agora);
    console.log(`👁️ [AUTO-OBSERVER] Nota ${notaId} sob observação — aguardando finalize-nota-estoque no servidor`);

    // Toast informativo discreto — confirmação real virá pelo realtime
    toast({
      title: '📋 Processando no servidor...',
      description: 'A nota está sendo finalizada automaticamente.',
    });

    if ('vibrate' in navigator) {
      navigator.vibrate([100, 50, 100]);
    }

    // Conclusão / erro virão pelo listener realtime (status_processamento)
    // — ver useEffect abaixo. Não há mais await aqui.
  };

  /**
   * 📄 Gera PDF em background (adaptado de CupomFiscalViewer)
   * IMPORTANTE: Esta função gera o PDF sem renderizar na UI
   */
  const gerarPDFBackground = async (
    notaId: string, 
    userId: string, 
    dadosExtraidos: any
  ): Promise<string | null> => {
    try {
      console.log('📄 [PDF-BG] Gerando PDF em background...');
      
      // ABORDAGEM: Criar elemento temporário oculto para captura
      const tempContainer = document.createElement('div');
      tempContainer.style.position = 'fixed';
      tempContainer.style.left = '-9999px';
      tempContainer.style.top = '-9999px';
      tempContainer.style.width = '350px';
      tempContainer.style.backgroundColor = 'white';
      tempContainer.setAttribute('data-cupom-fiscal', 'true');
      
      // Renderizar HTML do cupom (estrutura simplificada)
      tempContainer.innerHTML = `
        <div style="font-family: 'Courier New', monospace; padding: 20px; font-size: 12px; line-height: 1.4;">
          <div style="text-align: center; margin-bottom: 16px;">
            <div style="font-size: 18px; font-weight: bold; margin-bottom: 8px;">CUPOM FISCAL</div>
            <div>${dadosExtraidos?.estabelecimento?.nome || 'Estabelecimento'}</div>
            <div style="font-size: 11px; color: #666; margin-top: 4px;">
              CNPJ: ${dadosExtraidos?.estabelecimento?.cnpj || 'Não informado'}
            </div>
          </div>
          
          <div style="border-top: 2px dashed #333; border-bottom: 2px dashed #333; padding: 12px 0; margin: 16px 0;">
            <div style="font-weight: bold; margin-bottom: 8px;">ITENS DA COMPRA</div>
            ${(dadosExtraidos?.produtos || []).map((p: any, idx: number) => `
              <div style="margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid #eee;">
                <div style="font-weight: bold;">${idx + 1}. ${p.nome || p.descricao}</div>
                <div style="display: flex; justify-content: space-between; margin-top: 4px; font-size: 11px;">
                  <span>${p.quantidade} ${p.unidade} x R$ ${(p.valor_unitario || 0).toFixed(2)}</span>
                  <span style="font-weight: bold;">R$ ${(p.valor_total || 0).toFixed(2)}</span>
                </div>
              </div>
            `).join('')}
          </div>
          
          <div style="text-align: right; margin-top: 16px;">
            <div style="font-size: 14px; font-weight: bold;">
              TOTAL: R$ ${(dadosExtraidos?.total || 0).toFixed(2)}
            </div>
          </div>
          
          <div style="text-align: center; margin-top: 16px; font-size: 10px; color: #666;">
            ${dadosExtraidos?.data_emissao || 'Data não disponível'}
          </div>
        </div>
      `;
      
      document.body.appendChild(tempContainer);
      
      // Capturar com html2canvas
      const canvas = await html2canvas(tempContainer, {
        scale: 2,
        backgroundColor: '#ffffff',
        logging: false,
      });
      
      // Remover elemento temporário
      document.body.removeChild(tempContainer);
      
      // Converter para PDF
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });
      
      const imgWidth = 190;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 10, 10, imgWidth, imgHeight);
      
      // Gerar blob e fazer upload
      const pdfBlob = pdf.output('blob');
      const fileName = `${userId}/temp_nfce_${notaId}.pdf`;
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('receipts')
        .upload(fileName, pdfBlob, {
          contentType: 'application/pdf',
          upsert: true,
        });
      
      if (uploadError) {
        throw new Error(`Erro no upload: ${uploadError.message}`);
      }
      
      const { data: signed, error: signedError } = await supabase.storage
        .from('receipts')
        .createSignedUrl(fileName, 3600);

      if (signedError || !signed?.signedUrl) {
        throw new Error(`Falha ao gerar URL assinada: ${signedError?.message ?? 'sem URL'}`);
      }

      console.log('✅ [PDF-BG] PDF gerado e enviado:', signed.signedUrl);
      return signed.signedUrl;
      
    } catch (error: any) {
      console.error('❌ [PDF-BG] Erro ao gerar PDF:', error);
      return null;
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
            old_dados: !!payload.old?.dados_extraidos,
            new_dados: !!payload.new?.dados_extraidos,
            old_processing: payload.old?.processing_started_at,
            new_processing: payload.new?.processing_started_at,
            timestamp: new Date().toISOString()
          });
          
          const notaAtualizada = payload.new as any;
          const notaAnterior = payload.old as any;
          
          // 🔥 FILTRO CRÍTICO 1: Ignorar se dados_extraidos não mudou
          const dadosExtraidosNovo = notaAtualizada.dados_extraidos;
          const dadosExtraidosAntigo = notaAnterior?.dados_extraidos;
          
          if (!dadosExtraidosNovo || JSON.stringify(dadosExtraidosNovo) === JSON.stringify(dadosExtraidosAntigo)) {
            console.log('⚠️ [REALTIME] Ignorando UPDATE sem mudança em dados_extraidos');
            return;
          }
          
          // 🔥 FILTRO CRÍTICO 2: Ignorar se ainda está no lock atômico
          if (notaAtualizada.processing_started_at) {
            console.log('⚠️ [REALTIME] Nota ainda em processamento atômico (lock ativo), ignorando');
            return;
          }
          
          console.log('🔍 [REALTIME] Verificando condições:', {
            id: notaAtualizada.id,
            processada: notaAtualizada.processada,
            tem_dados: !!notaAtualizada.dados_extraidos,
            usuario_id: notaAtualizada.usuario_id
          });
          
          // ✅ VALIDAÇÃO 1: Se o viewer já está aberto, ignorar
          if (showCupomViewerRef.current || showInternalWebViewerRef.current) {
            console.log('⚠️ [REALTIME] Viewer já está aberto, ignorando evento');
            return;
          }
          
          // ✅ VALIDAÇÃO 2: Se a nota já foi confirmada, ignorar
          if (confirmedNotesRef.current.has(notaAtualizada.id)) {
            console.log('⚠️ [REALTIME] Nota já foi confirmada, ignorando');
            return;
          }
          
          // ✅ VALIDAÇÃO 3: Se a nota já tem itens no estoque, ignorar
          const { count: estoqueCount } = await supabase
            .from('estoque_app')
            .select('id', { count: 'exact', head: true })
            .eq('nota_id', notaAtualizada.id)
            .eq('user_id', user.id);

          if (estoqueCount && estoqueCount > 0) {
            console.log('⚠️ [REALTIME] Nota já tem itens no estoque, ignorando:', estoqueCount);
            if (processingNotesDataRef.current.has(notaAtualizada.id)) {
              removeProcessingNote(notaAtualizada.id);
              setProcessingNotesData(prev => {
                const newMap = new Map(prev);
                newMap.delete(notaAtualizada.id);
                return newMap;
              });
            }
            // 🔵 Marcar como concluída na fila se já tem estoque
            markQueueDoneByNotaId(notaAtualizada.id);
            return;
          }
          
          // Verificar se a nota tem dados REAIS extraídos
          if (temDadosReaisExtraidos(notaAtualizada.dados_extraidos)) {
            console.log('✅ [REALTIME] Nota com dados reais pronta para processamento:', notaAtualizada.id);
            
            // 🔥 DEBOUNCE: Consolidar múltiplos eventos (300ms)
            const existingTimer = debounceTimerRef.current.get(notaAtualizada.id);
            if (existingTimer) {
              console.log('⏱️ [REALTIME] Cancelando timer anterior (debounce)');
              clearTimeout(existingTimer);
            }
            
            const newTimer = setTimeout(async () => {
              console.log('🚀 [REALTIME] Debounce concluído, processando nota');
              
              // Verificar NOVAMENTE se já tem estoque
              const { count: estoqueCheck } = await supabase
                .from('estoque_app')
                .select('id', { count: 'exact', head: true })
                .eq('nota_id', notaAtualizada.id)
                .eq('user_id', user.id);
              
              if (estoqueCheck && estoqueCheck > 0) {
                console.log('⚠️ [REALTIME] Nota já processada durante debounce, ignorando');
                debounceTimerRef.current.delete(notaAtualizada.id);
                markQueueDoneByNotaId(notaAtualizada.id);
                return;
              }
              
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
                markQueueErrorByNotaId(notaAtualizada.id, 'Erro ao buscar dados');
                return;
              }

              // Recuperar URL e tipo de documento do mapa local
              const notaInfo = processingNotesDataRef.current.get(notaAtualizada.id);
              
              // ✅ PROCESSAMENTO AUTOMÁTICO
              console.log('🤖 [REALTIME] Iniciando processamento automático');
              
              // ✅ VERIFICAR se já está processando antes de disparar
              if (!activelyProcessingRef.current.has(notaAtualizada.id)) {
                toast({
                  title: "📋 Processando nota...",
                  description: "Validando e adicionando ao estoque automaticamente",
                });

                if ('vibrate' in navigator) {
                  navigator.vibrate([100, 50, 100]);
                }

                // Processar automaticamente
                await processarNotaAutomaticamente(notaAtualizada.id, user.id, notaData);
              } else {
                console.log('⚠️ [REALTIME] Nota já em processamento, ignorando');
              }
              
              // Limpar do mapa local e cancelar timeout
              setProcessingNotesData(prev => {
                const newMap = new Map(prev);
                newMap.delete(notaAtualizada.id);
                return newMap;
              });
              
              const timerId = processingTimersRef.current.get(notaAtualizada.id);
              if (timerId) {
                clearTimeout(timerId);
                setProcessingTimers(prev => {
                  const newMap = new Map(prev);
                  newMap.delete(notaAtualizada.id);
                  return newMap;
                });
              }
              
              // Limpar timer do mapa
              debounceTimerRef.current.delete(notaAtualizada.id);
            }, 300); // 300ms de debounce
            
            debounceTimerRef.current.set(notaAtualizada.id, newTimer);
            console.log('⏱️ [REALTIME] Debounce iniciado (300ms)');
            return;
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
  }, [user?.id, removeProcessingNote, toast, navigate]);

  // 🆕 Sub-fase C: Realtime listener dedicado a `status_processamento`
  // Observa transições de status do servidor (finalize-nota-estoque) e
  // atualiza fila local + toasts + navegação conservadora.
  useEffect(() => {
    if (!user?.id) return;

    console.log('🔔 [STATUS-OBSERVER] Configurando listener para status_processamento');

    const channel = supabase
      .channel('notas-status-processamento')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notas_imagens',
          filter: `usuario_id=eq.${user.id}`,
        },
        (payload) => {
          const novo = payload.new as any;
          const antigo = payload.old as any;
          if (!novo?.id) return;

          const statusNovo = novo.status_processamento;
          const statusAntigo = antigo?.status_processamento;
          if (statusNovo === statusAntigo) return;

          console.log(`📡 [STATUS-OBSERVER] ${novo.id}: ${statusAntigo} → ${statusNovo}`);

          // Só reagimos se a nota está sob observação local
          if (!activelyProcessingRef.current.has(novo.id) &&
              !notaIdToQueueRef.current.has(novo.id)) {
            return;
          }

          if (statusNovo === 'processada') {
            const itensCount = Array.isArray(novo.dados_extraidos?.itens)
              ? novo.dados_extraidos.itens.length
              : (Array.isArray(novo.dados_extraidos?.produtos)
                  ? novo.dados_extraidos.produtos.length
                  : 0);

            toast({
              title: '✅ Nota processada!',
              description: itensCount > 0
                ? `${itensCount} produtos adicionados ao estoque`
                : 'Estoque atualizado.',
            });

            markQueueDoneByNotaId(novo.id);
            removeProcessingNote(novo.id);
            activelyProcessingRef.current.delete(novo.id);

            // Navegação conservadora — 3 condições obrigatórias
            const rotaAtual = location.pathname;
            const rotasPermitidas = rotaAtual === '/' || rotaAtual === '/screenshots';
            const semInteracaoRecente = (Date.now() - lastUserNavigationAt.current) > 10000;
            // OBS: lastUserNavigationAt é atualizado a cada mudança de rota,
            // então "sem interação recente" = usuário ficou parado na rota
            // de captura por > 10s (caso típico do fluxo feliz: scan → espera).
            // Se ele acabou de chegar nessa rota (< 10s), é um sinal claro
            // de jornada ativa de captura — também navegamos.
            const jornadaAtivaDeCaptura = (Date.now() - lastUserNavigationAt.current) < 30000;

            if (rotasPermitidas && (semInteracaoRecente || jornadaAtivaDeCaptura)) {
              console.log('🧭 [STATUS-OBSERVER] Navegando para /screenshots (condições OK)');
              navigate('/screenshots');
            } else {
              console.log('🚫 [STATUS-OBSERVER] Navegação suprimida — usuário em outra jornada');
            }
            return;
          }

          if (statusNovo === 'erro') {
            const msg = novo.erro_mensagem || 'Falha ao processar a nota';
            toast({
              title: '❌ Erro ao processar nota',
              description: msg,
              variant: 'destructive',
              duration: 8000,
            });
            markQueueErrorByNotaId(novo.id, msg);
            removeProcessingNote(novo.id);
            activelyProcessingRef.current.delete(novo.id);
            return;
          }

          // Status intermediários (aguardando_estoque, processando) — só log.
        }
      )
      .subscribe((s) => {
        console.log('📡 [STATUS-OBSERVER] Status:', s);
      });

    return () => {
      console.log('🔌 [STATUS-OBSERVER] Desconectando');
      supabase.removeChannel(channel);
    };
  }, [user?.id, removeProcessingNote, toast, navigate, location.pathname]);

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

        if (!data?.processada && temDadosReaisExtraidos(data?.dados_extraidos)) {
          console.log('✅ [POLLING] Nota com dados reais detectada via polling!', noteId);
          
          // ✅ Verificar se já foi confirmada
          if (confirmedNotes.has(noteId)) {
            console.log('⚠️ [POLLING] Nota já foi confirmada, ignorando');
            removeProcessingNote(noteId);
            continue;
          }
          
          // ✅ VERIFICAÇÃO 1: Antes de aguardar
          if (activelyProcessingRef.current.has(noteId)) {
            console.log('⚠️ [POLLING] Real-time já está processando, ignorando imediatamente');
            removeProcessingNote(noteId);
            continue;
          }
          
          // ⏳ AGUARDAR 1s para dar prioridade ao Real-time
          console.log('⏳ [POLLING] Aguardando 1s para dar prioridade ao Real-time...');
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // ✅ VERIFICAÇÃO 2: Depois de aguardar
          if (activelyProcessingRef.current.has(noteId)) {
            console.log('⚠️ [POLLING] Real-time já processou, ignorando');
            removeProcessingNote(noteId);
            continue;
          }
          
          // Se chegou aqui, Real-time não processou, polling assume
          console.log('🟢 [POLLING] Real-time não processou, polling assumindo responsabilidade');
          
          // Processar automaticamente via polling
          await processarNotaAutomaticamente(noteId, user.id, data);
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

  // 🔄 POLLING PARA NOTAS ÓRFÃS (notas processadas mas sem estoque)
  useEffect(() => {
    if (!user?.id) return;
    
    const checkOrphanNotes = async () => {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      
      const { data: orphanNotes, error } = await supabase
        .from('notas_imagens')
        .select('id, dados_extraidos')
        .eq('usuario_id', user.id)
        .eq('processada', false)
        .eq('normalizada', false)
        .eq('produtos_normalizados', 0)
        .is('processing_started_at', null)
        .gt('created_at', fiveMinutesAgo);
      
      if (error) {
        console.error('❌ [ORPHAN] Erro ao buscar notas órfãs:', error);
        return;
      }
      
      if (!orphanNotes || orphanNotes.length === 0) return;
      
      console.log('🔍 [ORPHAN] Encontradas', orphanNotes.length, 'notas potencialmente órfãs');
      
      for (const nota of orphanNotes) {
        if (!temDadosReaisExtraidos(nota.dados_extraidos)) {
          console.log('⏳ [ORPHAN] Nota ainda em extração, aguardando:', nota.id);
          continue;
        }
        
        const { count } = await supabase
          .from('estoque_app')
          .select('id', { count: 'exact', head: true })
          .eq('nota_id', nota.id)
          .eq('user_id', user.id);
        
        if (!count || count === 0) {
          console.log('🔄 [ORPHAN] Processando nota órfã:', nota.id);
          
          if (activelyProcessingRef.current.has(nota.id)) {
            console.log('⚠️ [ORPHAN] Nota já em processamento, ignorando');
            continue;
          }
          
          toast({
            title: "🔄 Recuperando nota...",
            description: "Processando nota que ficou pendente",
          });
          
          await processarNotaAutomaticamente(nota.id, user.id, nota);
        }
      }
    };
    
    const interval = setInterval(checkOrphanNotes, 10000);
    checkOrphanNotes();
    
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
      {/* 🔵 Badge de processamento da fila local — DESATIVADO na Sub-fase D.
          O indicador global agora vive em <GlobalProcessingIndicator /> (App.tsx)
          e é alimentado pelo servidor (notas_imagens) via realtime + polling.
          A fila local (useNoteQueue) permanece ativa para orquestrar o pipeline de scan. */}
      {/* {noteQueue.visible && noteQueue.stats.total > 0 && (
        <ProcessingBadge
          stats={noteQueue.stats}
          startTime={noteQueue.queue.length > 0 ? noteQueue.queue[0].addedAt : Date.now()}
        />
      )} */}

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
          {(location.pathname === '/' || location.pathname === '/screenshots') && (
            <Button
              variant="default"
              size="lg"
              data-qr-scan-button="true"
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
