import React, { useEffect, useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Eye, Trash2, FileText, X, Bot, Loader2, CheckCircle, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';


interface Receipt {
  id: string;
  store_name: string | null;
  store_cnpj: string | null;
  total_amount: number | null;
  purchase_date: string | null;
  purchase_time?: string | null;
  qr_url: string;
  status: string | null;
  created_at: string;
  screenshot_url: string | null;
  processed_data: any;
  // Campos da tabela notas_imagens
  imagem_url?: string | null;
  dados_extraidos?: any;
  processada?: boolean;
  file_name?: string;
  file_type?: string;
}

const ReceiptList = () => {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReceipt, setSelectedReceipt] = useState<Receipt | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [processingReceipts, setProcessingReceipts] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  useEffect(() => {
    loadReceipts();
    
    // Auto-refresh a cada 5 segundos para capturar novas notas
    const interval = setInterval(loadReceipts, 5000);
    
    return () => clearInterval(interval);
  }, []);

  const loadReceipts = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        setLoading(false);
        return;
      }

      // Buscar tanto da tabela receipts quanto da notas_imagens
      const [receiptsResult, notasImagensResult] = await Promise.all([
        supabase
          .from('receipts')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('notas_imagens')
          .select('*')
          .eq('usuario_id', user.id)
          .order('created_at', { ascending: false })
      ]);

      if (receiptsResult.error) throw receiptsResult.error;
      if (notasImagensResult.error) throw notasImagensResult.error;

      // Mapear notas_imagens para o formato Receipt, filtrando páginas convertidas
      const mappedNotasImagens = (notasImagensResult.data || [])
        .map(nota => {
          const dadosExtraidos = nota.dados_extraidos as any;
          const fileName = nota.imagem_path ? nota.imagem_path.split('/').pop() : 'Arquivo sem nome';
          
          // Extrair dados da loja se processada
          const lojaNome = dadosExtraidos?.loja?.nome || fileName || 'Nota enviada';
          const valorTotal = dadosExtraidos?.valorTotal || null;
          const dataCompra = dadosExtraidos?.dataCompra || null;
          const horaCompra = dadosExtraidos?.horaCompra || null;
          
          // Verificar se é um PDF com conversão ou uma página convertida (que deve ser filtrada)
          const isPdfWithConversion = dadosExtraidos?.tipo === 'pdf_com_conversao';
          const isConvertedPage = dadosExtraidos?.pdf_origem_id;
          
          // Pular páginas convertidas - elas não devem aparecer na lista
          if (isConvertedPage) {
            return null;
          }
          
          return {
            id: nota.id,
            store_name: lojaNome,
            store_cnpj: dadosExtraidos?.loja?.cnpj || null,
            total_amount: valorTotal,
            purchase_date: dataCompra || nota.data_criacao,
            purchase_time: horaCompra,
            qr_url: dadosExtraidos?.url_original || '',
            status: nota.processada ? 'processed' : 'pending',
            created_at: nota.created_at,
            screenshot_url: nota.imagem_url,
            processed_data: nota.dados_extraidos,
            imagem_url: nota.imagem_url,
            dados_extraidos: nota.dados_extraidos,
            processada: nota.processada,
            file_name: fileName,
            file_type: isPdfWithConversion ? 'PDF (convertido)' : (nota.imagem_path?.toLowerCase().includes('.pdf') ? 'PDF' : 'Imagem')
          };
        })
        .filter(nota => nota !== null); // Remover itens nulos (páginas convertidas)

      // Combinar e ordenar por data
      const allReceipts = [
        ...(receiptsResult.data || []),
        ...mappedNotasImagens
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setReceipts(allReceipts);
    } catch (error) {
      console.error('Error loading receipts:', error);
      toast({
        title: "Erro",
        description: "Erro ao carregar notas fiscais",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const deleteReceipt = async (id: string) => {
    try {
      // Tentar deletar de ambas as tabelas
      const [receiptsResult, notasImagensResult] = await Promise.all([
        supabase.from('receipts').delete().eq('id', id),
        supabase.from('notas_imagens').delete().eq('id', id)
      ]);

      // Verificar se houve algum sucesso (quando não há erro, significa que a operação foi executada)
      const receiptsSuccess = !receiptsResult.error;
      const notasSuccess = !notasImagensResult.error;
      
      if (!receiptsSuccess && !notasSuccess) {
        throw new Error('Erro ao excluir nota fiscal de ambas as tabelas');
      }

      // Recarregar a lista após exclusão
      await loadReceipts();
      
      toast({
        title: "Sucesso", 
        description: "Nota fiscal excluída com sucesso",
      });
    } catch (error) {
      console.error('Error deleting receipt:', error);
      toast({
        title: "Erro",
        description: "Erro ao excluir nota fiscal",
        variant: "destructive",
      });
    }
  };

  const viewReceipt = (receipt: Receipt) => {
    setSelectedReceipt(receipt);
    setIsDialogOpen(true);
  };

  const openPDFInNative = async (url: string, fileName: string) => {
    try {
      if (Capacitor.isNativePlatform()) {
        // No mobile, abrir no navegador nativo
        await Browser.open({
          url: url,
          windowName: '_blank',
          presentationStyle: 'popover',
          toolbarColor: '#ffffff'
        });
        
        toast({
          title: "PDF aberto!",
          description: "O PDF foi aberto no navegador nativo do dispositivo",
        });
      } else {
        // No web, abrir em nova aba
        window.open(url, '_blank');
      }
    } catch (error) {
      console.error('Erro ao abrir PDF:', error);
      toast({
        title: "Erro",
        description: "Não foi possível abrir o PDF. Tente baixar o arquivo.",
        variant: "destructive",
      });
    }
  };

  const downloadPDF = async (url: string, fileName: string) => {
    try {
      if (Capacitor.isNativePlatform()) {
        // No mobile, abrir para visualizar/baixar
        await Browser.open({
          url: url,
          windowName: '_blank'
        });
      } else {
        // No web, fazer download
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName || 'nota-fiscal.pdf';
        link.click();
      }
      
      toast({
        title: "Arquivo acessado!",
        description: Capacitor.isNativePlatform() 
          ? "PDF aberto no navegador para visualizar ou baixar"
          : "Download iniciado",
      });
    } catch (error) {
      console.error('Erro ao baixar PDF:', error);
      toast({
        title: "Erro",
        description: "Não foi possível acessar o arquivo",
        variant: "destructive",
      });
    }
  };

  const processReceiptWithAI = async (receipt: Receipt) => {
    console.log('🔵 Iniciando processamento da nota:', receipt);
    
    if (processingReceipts.has(receipt.id)) {
      console.log('❌ Nota já está sendo processada');
      return;
    }

    try {
      console.log('🟡 Definindo estado de processamento...');
      setProcessingReceipts(prev => new Set(prev).add(receipt.id));
      
      console.log('🟡 Mostrando toast...');
      toast({
        title: "Processando nota fiscal",
        description: "A IA está analisando os dados da nota...",
      });

      let processedSuccessfully = false;
      
      // ✅ SEMPRE usar process-receipt-pdf para PDFs
      if (receipt.file_type === 'PDF' || receipt.imagem_url?.toLowerCase().includes('.pdf')) {
        console.log('🔄 PDF detectado, chamando process-receipt-pdf para:', receipt.id);
        
        const pdfResponse = await supabase.functions.invoke('process-receipt-pdf', {
          body: {
            notaImagemId: receipt.id,
            pdfUrl: receipt.imagem_url,
            userId: (await supabase.auth.getUser()).data.user?.id
          }
        });
        
        if (pdfResponse.data?.success) {
          console.log('✅ PDF processado com extração de texto');
          processedSuccessfully = true;
          
          toast({
            title: "PDF processado com sucesso!",
            description: `${pdfResponse.data.itens_extraidos || 0} itens extraídos via EXTRAÇÃO DE TEXTO.`,
          });
        } else {
          console.error('❌ Erro no processamento de PDF:', pdfResponse.error);
          
          // Verificar se é PDF escaneado (baseado em imagem)
          const isScannedPDF = 
            pdfResponse.data?.error === 'NO_ITEMS_EXTRACTED' ||
            pdfResponse.error?.message?.includes('texto suficiente') || 
            pdfResponse.error?.message?.includes('escaneado') ||
            pdfResponse.data?.message?.includes('escaneado') ||
            pdfResponse.data?.message?.includes('baseado em imagem');
            
          if (isScannedPDF) {
            console.log('⚠️ PDF escaneado detectado, fazendo fallback para OCR...');
            
            // Converter PDF para imagem primeiro
            const convertResponse = await supabase.functions.invoke('convert-pdf-to-jpg', {
              body: {
                notaImagemId: receipt.id,
                pdfUrl: receipt.imagem_url,
                userId: (await supabase.auth.getUser()).data.user?.id
              }
            });
            
            if (convertResponse.error) {
              throw new Error(`Erro na conversão: ${convertResponse.error.message}`);
            }
            
            // Usar as imagens convertidas
            let imageUrl = receipt.imagem_url;
            if (convertResponse.data?.convertedImages?.length > 0) {
              imageUrl = convertResponse.data.convertedImages[0].url;
              console.log('🔄 PDF convertido, usando imagem HD:', imageUrl);
            }
            
            // Processar com IA usando OCR como fallback
            const aiResponse = await supabase.functions.invoke('process-receipt-ai', {
              body: {
                notaId: receipt.id,
                imageUrl: imageUrl
              }
            });
            
            if (aiResponse.error) {
              throw new Error(aiResponse.error.message);
            }
            
            processedSuccessfully = true;
            toast({
              title: "PDF escaneado processado!",
              description: `${aiResponse.data.itens_extraidos || 0} itens extraídos via OCR (fallback).`,
            });
          } else {
            console.error('❌ Erro na resposta process-receipt-pdf:', pdfResponse);
            throw new Error(pdfResponse.error?.message || 'Erro no processamento do PDF');
          }
        }
      } else {
        // Para imagens, usar processamento direto
        const response = await supabase.functions.invoke('process-receipt-ai', {
          body: {
            notaId: receipt.id,
            imageUrl: receipt.imagem_url
          }
        });
        
        if (response.error) {
          throw new Error(response.error.message);
        }
        
        processedSuccessfully = true;
        toast({
          title: "Imagem processada com sucesso!",
          description: `${response.data.itens_extraidos || 0} itens extraídos.`,
        });
      }
      
      if (processedSuccessfully) {
        console.log('🔄 Recarregando lista de notas...');
        await loadReceipts();
      }

    } catch (error) {
      console.error('💥 Erro capturado:', error);
      console.error('💥 Tipo do erro:', typeof error);
      console.error('💥 Message:', error.message);
      console.error('💥 Stack:', error.stack);
      
      let errorMessage = "Não foi possível processar a nota fiscal";
      
      if (error.message?.includes('Failed to send a request')) {
        errorMessage = "Erro de conectividade com o servidor. Tente novamente.";
        console.error('🔴 Erro de conectividade detectado');
      } else if (error.message?.includes('Function not found')) {
        errorMessage = "Serviço de processamento não encontrado.";
        console.error('🔴 Função não encontrada');
      } else if (error.details) {
        errorMessage = error.details;
        console.error('🔴 Erro com detalhes:', error.details);
      } else if (error.message) {
        errorMessage = error.message;
        console.error('🔴 Erro com mensagem:', error.message);
      }
      
      toast({
        title: "Erro ao processar nota",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      console.log('🔚 Finalizando processamento...');
      setProcessingReceipts(prev => {
        const newSet = new Set(prev);
        newSet.delete(receipt.id);
        return newSet;
      });
    }
  };

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case 'processed':
        return <Badge variant="default">Processada</Badge>;
      case 'processing':
        return <Badge variant="secondary">Processando</Badge>;
      case 'pending':
        return <Badge variant="outline">Pendente</Badge>;
      default:
        return <Badge variant="outline">Desconhecido</Badge>;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatCurrency = (amount: number | null) => {
    if (!amount) return 'N/A';
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(amount);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (receipts.length === 0) {
    return (
      <div className="text-center p-8">
        <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
        <p className="text-muted-foreground">Nenhuma nota fiscal encontrada</p>
        <p className="text-sm text-muted-foreground mt-2">
          Escaneie QR codes de notas fiscais para começar
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        
        
        <div className="space-y-4">
          {receipts.map((receipt) => (
          <Card key={receipt.id}>
            <CardHeader className="pb-3">
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-lg">
                    {receipt.store_name || 'Estabelecimento não identificado'}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    {formatDate(receipt.created_at)}
                  </p>
                </div>
                {getStatusBadge(receipt.status)}
              </div>
            </CardHeader>
            
            <CardContent>
              <div className="space-y-2">
                {/* Mostrar dados extraídos pela IA quando processada */}
                {receipt.processada && receipt.dados_extraidos ? (
                  <>
                    {/* Mercado */}
                    {receipt.dados_extraidos.loja?.nome && (
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">Mercado:</span>
                        <span className="text-sm font-medium truncate max-w-[200px]">{receipt.dados_extraidos.loja.nome}</span>
                      </div>
                    )}
                    
                    {/* Valor Total */}
                    {receipt.dados_extraidos.valorTotal && (
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">Valor Total:</span>
                        <span className="font-semibold">{formatCurrency(receipt.dados_extraidos.valorTotal)}</span>
                      </div>
                    )}
                    
                    {/* Data */}
                    {receipt.dados_extraidos.dataCompra && (
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">Data:</span>
                        <span className="text-sm">
                          {new Date(receipt.dados_extraidos.dataCompra).toLocaleDateString('pt-BR')}
                          {receipt.dados_extraidos.horaCompra && ` às ${receipt.dados_extraidos.horaCompra}`}
                        </span>
                      </div>
                    )}
                  </>
                ) : (
                  /* Mostrar dados básicos quando não processada */
                  <>
                    {receipt.file_name && (
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">Arquivo:</span>
                        <span className="text-sm font-mono truncate max-w-[200px]">{receipt.file_name}</span>
                      </div>
                    )}
                    
                    {receipt.file_type && (
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">Tipo:</span>
                        <span className="text-sm">{receipt.file_type}</span>
                      </div>
                    )}
                    
                    {receipt.total_amount && (
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">Total:</span>
                        <span className="font-semibold">{formatCurrency(receipt.total_amount)}</span>
                      </div>
                    )}
                    
                    {receipt.purchase_date && (
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">Data da compra:</span>
                        <span className="text-sm">{new Date(receipt.purchase_date).toLocaleDateString('pt-BR')}</span>
                      </div>
                    )}
                  </>
                )}

                {receipt.store_cnpj && (
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">CNPJ:</span>
                    <span className="text-sm font-mono">{receipt.store_cnpj}</span>
                  </div>
                )}
              </div>
              
              <div className="flex justify-between items-center mt-4 gap-2">
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => viewReceipt(receipt)}
                  >
                    <Eye className="w-4 h-4 mr-2" />
                    {receipt.file_type === 'PDF' && Capacitor.isNativePlatform() 
                      ? 'Abrir PDF' 
                      : 'Ver Detalhes'
                    }
                  </Button>
                  
                  {/* Botão de processar com IA para notas não processadas */}
                  {!receipt.processada && (receipt.imagem_url || (receipt.dados_extraidos as any)?.imagens_convertidas) && (
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => processReceiptWithAI(receipt)}
                      disabled={processingReceipts.has(receipt.id)}
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      {processingReceipts.has(receipt.id) ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Bot className="w-4 h-4 mr-2" />
                      )}
                      {processingReceipts.has(receipt.id) ? 'Processando...' : 'Extrair com IA'}
                    </Button>
                  )}
                  
                  {/* Mostrar resultado se processada */}
                  {receipt.processada && (
                    <div className="flex items-center gap-2 text-green-600">
                      <CheckCircle className="h-4 w-4" />
                      <span className="text-sm">
                        Processada ({(receipt.dados_extraidos as any)?.itens?.length || 0} itens)
                      </span>
                    </div>
                  )}
                </div>
                
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteReceipt(receipt.id)}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
          ))}
        </div>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className={`${Capacitor.isNativePlatform() ? 'fixed inset-0 max-w-none max-h-none w-screen h-screen m-0 p-0 rounded-none border-0' : 'max-w-[95vw] max-h-[95vh] w-full'} overflow-hidden flex flex-col`}>
          <DialogHeader className={`flex-shrink-0 ${Capacitor.isNativePlatform() ? 'p-2' : 'p-4'} border-b bg-background`}>
            <div className="flex items-center justify-between">
              <DialogTitle className="text-base">Detalhes da Nota Fiscal</DialogTitle>
              {Capacitor.isNativePlatform() && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsDialogOpen(false)}
                  className="p-1"
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>
          </DialogHeader>
          
          {selectedReceipt && (
            <div className="flex-1 overflow-hidden">
              {/* Para PDFs, exibir diretamente */}
              {selectedReceipt.file_type === 'PDF' && selectedReceipt.imagem_url ? (
                <div className="h-full flex flex-col">
                  {/* Visualizador PDF otimizado para mobile */}
                  <div className="flex-1 relative">
                    {Capacitor.isNativePlatform() ? (
                      // Para mobile: usar embed ou object para melhor compatibilidade
                      <div className="w-full h-full bg-white">
                        <embed
                          src={selectedReceipt.imagem_url}
                          type="application/pdf"
                          className="w-full h-full"
                          style={{ minHeight: '100%' }}
                        />
                        {/* Fallback se embed não funcionar */}
                        <div className="absolute inset-0 flex items-center justify-center bg-muted/90 backdrop-blur-sm">
                          <div className="text-center space-y-4 p-6">
                            <FileText className="w-12 h-12 mx-auto text-muted-foreground" />
                            <div>
                              <h3 className="font-semibold mb-2">Visualizar PDF</h3>
                              <p className="text-sm text-muted-foreground mb-4">
                                Toque para abrir o arquivo PDF
                              </p>
                              <div className="space-y-2">
                                <Button
                                  onClick={() => openPDFInNative(selectedReceipt.imagem_url!, selectedReceipt.file_name || 'nota-fiscal.pdf')}
                                  className="w-full"
                                >
                                  <Eye className="w-4 h-4 mr-2" />
                                  Abrir PDF
                                </Button>
                                <Button
                                  variant="outline"
                                  onClick={() => downloadPDF(selectedReceipt.imagem_url!, selectedReceipt.file_name || 'nota-fiscal.pdf')}
                                  className="w-full"
                                >
                                  Baixar PDF
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      // Para web: iframe funciona bem
                      <iframe
                        src={`${selectedReceipt.imagem_url}#toolbar=1&navpanes=1&scrollbar=1&zoom=page-width`}
                        className="w-full h-full border-0"
                        title="Visualizador de PDF"
                        style={{ minHeight: '70vh' }}
                      />
                    )}
                  </div>
                </div>
              ) : (
                /* Para imagens e outras informações */
                <div className="p-4 space-y-6 h-full overflow-y-auto">
                  <div>
                    <h4 className="font-semibold mb-3">Informações Gerais</h4>
                    <div className="space-y-3 text-sm">
                      <div className="flex justify-between items-center p-2 bg-muted/30 rounded">
                        <span className="text-muted-foreground">Estabelecimento:</span>
                        <span className="font-medium">{selectedReceipt.store_name || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between items-center p-2 bg-muted/30 rounded">
                        <span className="text-muted-foreground">Total:</span>
                        <span className="font-semibold text-green-600 dark:text-green-400">
                          {formatCurrency(selectedReceipt.total_amount)}
                        </span>
                      </div>
                      {selectedReceipt.store_cnpj && (
                        <div className="flex justify-between items-center p-2 bg-muted/30 rounded">
                          <span className="text-muted-foreground">CNPJ:</span>
                          <span className="font-mono text-xs">{selectedReceipt.store_cnpj}</span>
                        </div>
                      )}
                      {selectedReceipt.purchase_date && (
                        <div className="flex justify-between items-center p-2 bg-muted/30 rounded">
                          <span className="text-muted-foreground">Data da compra:</span>
                          <span>{new Date(selectedReceipt.purchase_date).toLocaleDateString('pt-BR')}</span>
                        </div>
                      )}
                      <div className="flex justify-between items-center p-2 bg-muted/30 rounded">
                        <span className="text-muted-foreground">Status:</span>
                        <span>{getStatusBadge(selectedReceipt.status)}</span>
                      </div>
                    </div>
                  </div>

                  {selectedReceipt.imagem_url && selectedReceipt.file_type !== 'PDF' && (
                    <div>
                      <h4 className="font-semibold mb-3">Imagem da Nota</h4>
                      <div className="border rounded-lg overflow-hidden">
                        <img 
                          src={selectedReceipt.imagem_url} 
                          alt="Imagem da nota fiscal"
                          className="w-full max-h-[500px] object-contain bg-gray-50 dark:bg-gray-900 cursor-pointer"
                          onClick={() => window.open(selectedReceipt.imagem_url, '_blank')}
                        />
                      </div>
                    </div>
                  )}

                  <div className="space-y-3">
                    {selectedReceipt.qr_url && (
                      <Button
                        variant="outline"
                        onClick={() => window.open(selectedReceipt.qr_url, '_blank')}
                        className="w-full"
                      >
                        <Eye className="w-4 h-4 mr-2" />
                        Abrir QR Original
                      </Button>
                    )}
                    {selectedReceipt.imagem_url && (
                      <Button
                        variant="outline"
                        onClick={() => window.open(selectedReceipt.imagem_url, '_blank')}
                        className="w-full"
                      >
                        <FileText className="w-4 h-4 mr-2" />
                        Abrir Arquivo Completo
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ReceiptList;