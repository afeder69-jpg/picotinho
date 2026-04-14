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
 * 2. → Chama process-url-nota (edge function)
 * 3. → Extração automática via InfoSimples/Serpro
 * 4. → Realtime listener detecta dados_extraidos preenchido
 * 5. → processarNotaAutomaticamente() AUTOMÁTICO
 * 6. → Gera PDF → valida → processa estoque
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
import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/components/auth/AuthProvider";
import { detectarTipoDocumento, TipoDocumento, extrairChaveNFe, construirUrlConsulta } from "@/lib/documentDetection";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { useProcessingNotes } from "@/contexts/ProcessingNotesContext";
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

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
  const debounceTimerRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const lastProcessingTimestamp = useRef<Map<string, number>>(new Map());
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
    
    // Normalizar dados do QR Code: aceitar URL ou extrair chave de formatos não-URL
    let urlParaProcessar = data;
    const urlPattern = /^https?:\/\/.+/i;
    
    if (!urlPattern.test(data)) {
      // QR code não é URL — tentar extrair chave de acesso diretamente
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
    
    try {
      const chaveAcesso = extrairChaveNFe(urlParaProcessar);
      
      if (!chaveAcesso) {
        throw new Error('Não foi possível extrair a chave de acesso da URL');
      }
      
      console.log('🔑 Chave extraída:', chaveAcesso);
      
      // 🆕 GERAR ID TEMPORÁRIO IMEDIATAMENTE
      const tempId = `temp-${Date.now()}`;
      console.log('🔵 [BADGE] Adicionando nota temporária:', tempId);
      addProcessingNote(tempId);
      setProcessingNotesData(prev => new Map(prev).set(tempId, { url: urlParaProcessar, tipoDocumento }));
      
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
      functionCall.then(({ data: processData, error: processError }) => {
        console.log('🔍 [DEBUG] Resposta da edge function:', processData);
        
        if (processError) {
          console.error('❌ Erro ao iniciar processamento:', processError);
          // Remover ID temporário em caso de erro
          removeProcessingNote(tempId);
          setProcessingNotesData(prev => {
            const newMap = new Map(prev);
            newMap.delete(tempId);
            return newMap;
          });
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
          // Remover ID temporário se não houver noteId
          removeProcessingNote(tempId);
          setProcessingNotesData(prev => {
            const newMap = new Map(prev);
            newMap.delete(tempId);
            return newMap;
          });
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

  /**
   * 🤖 PROCESSAMENTO AUTOMÁTICO DE NOTAS FISCAIS (SEM CONFIRMAÇÃO MANUAL)
   * 
   * Esta função é chamada automaticamente quando o realtime detecta que
   * dados_extraidos foi preenchido em notas_imagens.
   * 
   * FLUXO:
   * 1. Gera PDF temporário (necessário para validate-receipt)
   * 2. Chama validate-receipt para verificar duplicatas
   * 3. Se aprovada → chama process-receipt-full (normalização + estoque)
   * 4. Se rejeitada → deleta a nota e notifica usuário
   * 
   * ⚠️ NÃO REQUER CONFIRMAÇÃO DO USUÁRIO
   * Todo o processo é automático após extração dos dados.
   */
  const processarNotaAutomaticamente = async (
    notaId: string, 
    userId: string, 
    notaData: any
  ) => {
    // ✅ GUARD 1: Evitar processamento duplicado usando ref síncrona
    if (activelyProcessingRef.current.has(notaId)) {
      console.log(`⚠️ [AUTO] Nota ${notaId} já está sendo processada, ignorando...`);
      return;
    }
    
    // ✅ GUARD 2: Verificar timestamp para evitar race conditions (30s de bloqueio)
    const lastProcessing = lastProcessingTimestamp.current.get(notaId) || 0;
    const agora = Date.now();
    if (agora - lastProcessing < 30000) {
      console.log(`⚠️ [AUTO] Nota ${notaId} processada recentemente (${((agora - lastProcessing) / 1000).toFixed(0)}s atrás), ignorando...`);
      return;
    }
    
    // Marcar como em processamento INSTANTANEAMENTE
    activelyProcessingRef.current.add(notaId);
    lastProcessingTimestamp.current.set(notaId, agora);
    console.log(`🔒 [AUTO] Nota ${notaId} BLOQUEADA para processamento`);
    
    try {
      console.log('🤖 [AUTO] Iniciando processamento automático da nota:', notaId);
      
      // 1. Gerar PDF temporário (necessário para validação)
      console.log('📄 [AUTO] Gerando PDF temporário...');
      const pdfUrl = await gerarPDFBackground(notaId, userId, notaData.dados_extraidos);
      
      if (!pdfUrl) {
        throw new Error('Falha ao gerar PDF temporário');
      }
      
      console.log('✅ [AUTO] PDF gerado:', pdfUrl);
      
    // 2. Validar nota
    console.log('🔍 [AUTO] Validando nota...');
    const { data: validationData, error: validationError } = await supabase.functions.invoke(
      'validate-receipt',
      {
        body: {
          notaImagemId: notaId,
          userId: userId,
          pdfUrl: pdfUrl,
          fromInfoSimples: true,
        },
      }
    );
      
      if (validationError) {
        console.error('❌ [AUTO] Erro na validação:', validationError);
        throw validationError;
      }
      
      console.log('📋 [AUTO] Resultado da validação:', validationData);
      
      // 3. Verificar se foi aprovada
      if (!validationData?.approved) {
        console.warn('⚠️ [AUTO] Nota REJEITADA:', validationData?.reason);
        
        const toastTitle = validationData?.reason === 'duplicada' 
          ? '⚠️ Nota Duplicada' 
          : '❌ Nota inválida';
        
        const toastDescription = validationData?.message || 'A nota não passou na validação';
        
        toast({
          title: toastTitle,
          description: toastDescription,
          variant: 'destructive',
          duration: 5000,
        });
        
      // 🗑️ Deletar nota rejeitada
      console.log('🗑️ [AUTO] Deletando nota rejeitada...');
      await supabase.from('notas_imagens').delete().eq('id', notaId);
      
      // Remover do array de processamento para evitar loop
      removeProcessingNote(notaId);
      
      // Limpar PDF temporário
      const fileName = `${userId}/temp_nfce_${notaId}.pdf`;
      await supabase.storage.from('receipts').remove([fileName]);
      
      console.log('✅ [AUTO] Nota rejeitada deletada');
      return;
      }
      
      // 4. ✅ Nota APROVADA - Processar estoque
      console.log('✅ [AUTO] Nota APROVADA - processando estoque...');
      
      // 5. Processar estoque em background
      const { data: processData, error: processError } = await supabase.functions.invoke(
        'process-receipt-full',
        { body: { notaId, userId } }
      );
      
      if (processError) {
        console.error('❌ [AUTO] Erro ao processar estoque:', processError);
        toast({
          title: 'Erro ao processar estoque',
          description: processError.message || 'Tente novamente',
          variant: 'destructive',
        });
        return;
      }
      
      console.log('✅ [AUTO] Estoque processado:', processData);
      
      // Toast final consolidado
      toast({
        title: '✅ Nota processada!',
        description: `${processData?.itens_inseridos || 0} produtos adicionados ao estoque`,
      });
      
      // Navegar para "Minhas Notas" após processamento
      navigate('/screenshots');
      
      // 6. Limpar PDF temporário
      const fileName = `${userId}/temp_nfce_${notaId}.pdf`;
      await supabase.storage.from('receipts').remove([fileName]);
      await supabase.from('notas_imagens').update({ pdf_url: null }).eq('id', notaId);
      
      console.log('🎉 [AUTO] Processamento automático concluído!');
      
    } catch (error: any) {
      console.error('❌ [AUTO] Erro no processamento automático:', error);
      toast({
        title: 'Erro ao processar nota',
        description: error.message || 'Tente novamente',
        variant: 'destructive',
      });
      
      // Tentar deletar nota com erro
      try {
        await supabase.from('notas_imagens').delete().eq('id', notaId);
        removeProcessingNote(notaId);
      } catch (deleteError) {
        console.error('❌ [AUTO] Erro ao deletar nota com erro:', deleteError);
      }
    } finally {
      // ✅ SEMPRE remover do Set ao finalizar
      activelyProcessingRef.current.delete(notaId);
      console.log(`🔓 [AUTO] Nota ${notaId} DESBLOQUEADA`);
    }
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
      
      const { data: urlData } = supabase.storage
        .from('receipts')
        .getPublicUrl(fileName);
      
      console.log('✅ [PDF-BG] PDF gerado e enviado:', urlData.publicUrl);
      return urlData.publicUrl;
      
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
          // (isso significa que process-receipt-full já foi executado)
          const { count: estoqueCount } = await supabase
            .from('estoque_app')
            .select('id', { count: 'exact', head: true })
            .eq('nota_id', notaAtualizada.id)
            .eq('user_id', user.id);

          if (estoqueCount && estoqueCount > 0) {
            console.log('⚠️ [REALTIME] Nota já tem itens no estoque, ignorando:', estoqueCount);
            // Limpar do mapa de processamento se existir
            if (processingNotesDataRef.current.has(notaAtualizada.id)) {
              removeProcessingNote(notaAtualizada.id);
              setProcessingNotesData(prev => {
                const newMap = new Map(prev);
                newMap.delete(notaAtualizada.id);
                return newMap;
              });
            }
            return;
          }
          
          // Verificar se a nota tem dados_extraidos (necessário para processamento)
          if (notaAtualizada.dados_extraidos) {
            console.log('✅ [REALTIME] Nota pronta para processamento:', notaAtualizada.id);
            
            // 🔥 DEBOUNCE: Consolidar múltiplos eventos (300ms)
            const existingTimer = debounceTimerRef.current.get(notaAtualizada.id);
            if (existingTimer) {
              console.log('⏱️ [REALTIME] Cancelando timer anterior (debounce)');
              clearTimeout(existingTimer);
            }
            
            const newTimer = setTimeout(async () => {
              console.log('🚀 [REALTIME] Debounce concluído, processando nota');
              
              // Verificar NOVAMENTE se já tem estoque (pode ter sido processado durante debounce)
              const { count: estoqueCheck } = await supabase
                .from('estoque_app')
                .select('id', { count: 'exact', head: true })
                .eq('nota_id', notaAtualizada.id)
                .eq('user_id', user.id);
              
              if (estoqueCheck && estoqueCheck > 0) {
                console.log('⚠️ [REALTIME] Nota já processada durante debounce, ignorando');
                debounceTimerRef.current.delete(notaAtualizada.id);
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
            return; // Não executar o resto até o debounce completar
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
  }, [user?.id, processingNotesData, processingTimers, removeProcessingNote, showCupomViewer, showInternalWebViewer, confirmedNotes, toast, navigate]);

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

        if (!data?.processada && data?.dados_extraidos) {
          console.log('✅ [POLLING] Nota processada detectada via polling!', noteId);
          
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
          
          // Processar automaticamente via polling (sem toast duplicado)
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
  // Este useEffect detecta notas que ficaram "perdidas" por race condition
  useEffect(() => {
    if (!user?.id) return;
    
    const checkOrphanNotes = async () => {
      // Buscar notas recentes (últimos 5 min) que foram processadas mas não têm estoque
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
        // Verificar se realmente não tem estoque
        const { count } = await supabase
          .from('estoque_app')
          .select('id', { count: 'exact', head: true })
          .eq('nota_id', nota.id)
          .eq('user_id', user.id);
        
        if (!count || count === 0) {
          // ✅ Esta é uma nota órfã - processar automaticamente
          console.log('🔄 [ORPHAN] Processando nota órfã:', nota.id);
          
          // Verificar se já não está sendo processada
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
    
    // Verificar a cada 10 segundos
    const interval = setInterval(checkOrphanNotes, 10000);
    
    // Verificar imediatamente ao montar
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