import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Eye, Trash2, FileText, X, Bot, Loader2, CheckCircle } from 'lucide-react';
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
  imagem_url?: string | null;
  dados_extraidos?: any;
  processada?: boolean;
  file_name?: string;
  file_type?: string;
  debug_texto?: string;
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

      const [receiptsResult, notasImagensResult] = await Promise.all([
        supabase.from('receipts').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('notas_imagens').select('*, debug_texto').eq('usuario_id', user.id).order('created_at', { ascending: false })
      ]);

      if (receiptsResult.error) throw receiptsResult.error;
      if (notasImagensResult.error) throw notasImagensResult.error;

      const mappedNotasImagens = (notasImagensResult.data || [])
        .map(nota => {
          const dadosExtraidos = nota.dados_extraidos as any;
          const fileName = nota.imagem_path ? nota.imagem_path.split('/').pop() : 'Arquivo sem nome';
          const lojaNome = dadosExtraidos?.loja?.nome || fileName || 'Nota enviada';
          const valorTotal = dadosExtraidos?.valorTotal || null;
          const dataCompra = dadosExtraidos?.dataCompra || null;
          const horaCompra = dadosExtraidos?.horaCompra || null;
          const isPdfWithConversion = dadosExtraidos?.tipo === 'pdf_com_conversao';
          const isConvertedPage = dadosExtraidos?.pdf_origem_id;
          if (isConvertedPage) return null;

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
            file_type: isPdfWithConversion ? 'PDF (convertido)' : (nota.imagem_path?.toLowerCase().includes('.pdf') ? 'PDF' : 'Imagem'),
            debug_texto: (nota as any).debug_texto
          };
        })
        .filter(nota => nota !== null);

      const allReceipts = [
        ...(receiptsResult.data || []),
        ...mappedNotasImagens
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      console.log('🔍 Debug texto check:', allReceipts.map(r => ({ 
        id: r.id, 
        file_name: (r as any).file_name || 'sem nome',
        debug_texto: (r as any).debug_texto ? `PRESENTE (${(r as any).debug_texto.length} chars)` : 'AUSENTE' 
      })));

      setReceipts(allReceipts);
    } catch (error) {
      console.error('Error loading receipts:', error);
      toast({ title: "Erro", description: "Erro ao carregar notas fiscais", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const deleteReceipt = async (id: string) => {
    try {
      const [receiptsResult, notasImagensResult] = await Promise.all([
        supabase.from('receipts').delete().eq('id', id),
        supabase.from('notas_imagens').delete().eq('id', id)
      ]);

      const receiptsSuccess = !receiptsResult.error;
      const notasSuccess = !notasImagensResult.error;
      if (!receiptsSuccess && !notasSuccess) {
        throw new Error('Erro ao excluir nota fiscal');
      }

      await loadReceipts();
      toast({ title: "Sucesso", description: "Nota fiscal excluída com sucesso" });
    } catch (error) {
      console.error('Error deleting receipt:', error);
      toast({ title: "Erro", description: "Erro ao excluir nota fiscal", variant: "destructive" });
    }
  };

  const viewReceipt = (receipt: Receipt) => {
    // Se for cupom fiscal processado, abrir em nova janela
    if (receipt.dados_extraidos && receipt.processada) {
      openReceiptInNewWindow(receipt);
    } else {
      setSelectedReceipt(receipt);
      setIsDialogOpen(true);
    }
  };

  const openReceiptInNewWindow = (receipt: Receipt) => {
    const cupomHtml = generateCupomHtml(receipt);
    
    if (Capacitor.isNativePlatform()) {
      // No mobile, criar blob e abrir no navegador interno
      const blob = new Blob([cupomHtml], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      
      Browser.open({
        url: url,
        windowName: '_self',
        presentationStyle: 'fullscreen'
      });
    } else {
      // No desktop, manter comportamento atual
      const newWindow = window.open('', '_blank', 'width=400,height=700,scrollbars=yes,resizable=yes');
      if (newWindow) {
        newWindow.document.write(cupomHtml);
        newWindow.document.close();
      }
    }
  };

  const generateCupomHtml = (receipt: Receipt) => {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Cupom Fiscal Digital</title>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { 
              font-family: 'Courier New', monospace; 
              font-size: 12px; 
              margin: 10px; 
              background: white; 
              color: black;
              line-height: 1.4;
            }
            .close-btn {
              position: fixed;
              top: 10px;
              right: 10px;
              background: #f44336;
              color: white;
              border: none;
              border-radius: 50%;
              width: 50px;
              height: 50px;
              font-size: 24px;
              font-weight: bold;
              cursor: pointer;
              box-shadow: 0 4px 12px rgba(0,0,0,0.4);
              z-index: 1000;
              touch-action: manipulation;
            }
            .close-btn:hover, .close-btn:active {
              background: #d32f2f;
              transform: scale(1.1);
            }
            
            @media (max-width: 768px) {
              .close-btn {
                width: 60px;
                height: 60px;
                font-size: 28px;
                top: 20px;
                right: 20px;
              }
            }
            .center { text-align: center; }
            .bold { font-weight: bold; }
            .border-bottom { border-bottom: 1px solid #000; padding-bottom: 8px; margin-bottom: 8px; }
            .border-top { border-top: 1px solid #000; padding-top: 8px; margin-top: 8px; }
            .item { margin: 8px 0; padding: 4px 0; border-bottom: 1px dashed #ccc; }
            .item:last-child { border-bottom: none; }
            .flex { display: flex; justify-content: space-between; }
            .total { font-size: 16px; font-weight: bold; }
          </style>
        </head>
        <body>
          <button class="close-btn" onclick="if(window.Capacitor){window.Capacitor.Plugins.Browser.close()}else{window.close()}" title="Fechar">×</button>
          
          <div class="center border-bottom">
            <h2 class="bold">${receipt.dados_extraidos.estabelecimento?.nome || receipt.dados_extraidos.loja?.nome || 'ESTABELECIMENTO'}</h2>
            <p>CNPJ: ${receipt.dados_extraidos.estabelecimento?.cnpj || receipt.dados_extraidos.loja?.cnpj || 'N/A'}</p>
            <p>${receipt.dados_extraidos.estabelecimento?.endereco || receipt.dados_extraidos.loja?.endereco || 'Endereço não informado'}</p>
          </div>
          
          <div class="center border-bottom">
            <p class="bold">Nota Fiscal de Consumidor Eletrônica</p>
            <div class="flex">
              <span>Número: ${receipt.dados_extraidos.compra?.numero || receipt.dados_extraidos.numeroNota || 'N/A'}</span>
              <span>Série: ${receipt.dados_extraidos.compra?.serie || receipt.dados_extraidos.serie || 'N/A'}</span>
            </div>
            <p>Data: ${receipt.dados_extraidos.compra?.data_emissao || receipt.dados_extraidos.dataCompra || 'N/A'}</p>
          </div>
          
          <div>
            <p class="bold center">ITENS</p>
            ${receipt.dados_extraidos.itens?.map((item: any, index: number) => `
              <div class="item">
                <div>
                  <p class="bold">${item.descricao || item.nome}</p>
                  ${item.codigo ? `<p>Cód: ${item.codigo}</p>` : ''}
                </div>
                <div class="flex">
                  <span>Qtd: ${item.quantidade} ${item.unidade || ''}</span>
                  <span>Unit: ${formatCurrency(item.valor_unitario || item.preco)}</span>
                  <span class="bold">Total: ${formatCurrency(item.valor_total || item.preco)}</span>
                </div>
              </div>
            `).join('') || ''}
          </div>
          
          <div class="border-top">
            <div class="flex total">
              <span>TOTAL:</span>
              <span>${formatCurrency(receipt.dados_extraidos.compra?.valor_total || receipt.dados_extraidos.valorTotal || receipt.total_amount)}</span>
            </div>
            <div class="center">
              <p>Forma de Pagamento: ${receipt.dados_extraidos.compra?.forma_pagamento || receipt.dados_extraidos.formaPagamento || 'N/A'}</p>
            </div>
          </div>
          
          <div class="center border-top">
            <p>Via do Consumidor</p>
          </div>
        </body>
      </html>
    `;
  };

  const processReceiptWithAI = async (receipt: Receipt) => {
    if (processingReceipts.has(receipt.id)) return;

    try {
      setProcessingReceipts(prev => new Set(prev).add(receipt.id));
      toast({ title: "Processando nota fiscal", description: "A IA está analisando os dados da nota..." });

      let processedSuccessfully = false;
      const isPDF = receipt.file_type?.toLowerCase().includes('pdf') || receipt.imagem_url?.toLowerCase().endsWith('.pdf');

      if (isPDF) {
        console.log("📄 PDF detectado - usando process-danfe-pdf");
        console.log("🔍 Dados enviados:", { 
          pdfUrl: receipt.imagem_url, 
          notaImagemId: receipt.id, 
          userId: (await supabase.auth.getUser()).data.user?.id 
        });
        
        // Sempre usar process-danfe-pdf para PDFs
        const pdfResponse = await supabase.functions.invoke('process-danfe-pdf', {
          body: { 
            pdfUrl: receipt.imagem_url, 
            notaImagemId: receipt.id, 
            userId: (await supabase.auth.getUser()).data.user?.id 
          }
        });

        console.log("📋 Resposta da função:", pdfResponse);

        if (pdfResponse.data?.success && pdfResponse.data?.textoCompleto) {
          console.log("✅ PDF processado com sucesso:", pdfResponse.data);
          processedSuccessfully = true;
        } else if (pdfResponse.error) {
          console.error("❌ Erro na função process-danfe-pdf:", pdfResponse.error);
          
          // Se for erro INSUFFICIENT_TEXT, fazer fallback para OCR
          if (pdfResponse.error.message?.includes('INSUFFICIENT_TEXT')) {
            toast({ 
              title: "PDF escaneado detectado", 
              description: "Texto insuficiente - OCR não implementado ainda",
              variant: "destructive" 
            });
            return;
          }
          
          throw new Error(pdfResponse.error.message || "Erro no processamento do PDF");
        }

        if (!pdfResponse.data?.success) {
          throw new Error(pdfResponse.data?.message || "Falha no processamento do PDF");
        }

        console.log("✅ PDF processado com sucesso:", pdfResponse.data);
        toast({ 
          title: "Nota fiscal processada com sucesso!", 
          description: "Use o botão 'Ver Detalhes' para visualizar o cupom fiscal digital." 
        });
        processedSuccessfully = true;

      } else {
        toast({
          title: "Processamento de imagens não implementado",
          description: "Apenas PDFs são suportados no momento",
          variant: "destructive"
        });
        return;
      }

      if (processedSuccessfully) await loadReceipts();

    } catch (error: any) {
      console.error('💥 Erro ao processar nota:', error);
      toast({
        title: "Erro ao processar nota",
        description: error.message || "Falha inesperada no processamento",
        variant: "destructive"
      });
    } finally {
      setProcessingReceipts(prev => {
        const newSet = new Set(prev);
        newSet.delete(receipt.id);
        return newSet;
      });
    }
  };

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case 'processed': return <Badge variant="default">Processada</Badge>;
      case 'processing': return <Badge variant="secondary">Processando</Badge>;
      case 'pending': return <Badge variant="outline">Pendente</Badge>;
      default: return <Badge variant="outline">Desconhecido</Badge>;
    }
  };

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const formatCurrency = (amount: number | null) =>
    !amount ? 'N/A' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(amount);

  if (loading) {
    return <div className="flex justify-center items-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>;
  }

  if (receipts.length === 0) {
    return (
      <div className="text-center p-8">
        <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
        <p className="text-muted-foreground">Nenhuma nota fiscal encontrada</p>
        <p className="text-sm text-muted-foreground mt-2">Escaneie QR codes de notas fiscais para começar</p>
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
                    <CardTitle className="text-lg">{receipt.store_name || 'Estabelecimento não identificado'}</CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">{formatDate(receipt.created_at)}</p>
                  </div>
                  {getStatusBadge(receipt.status)}
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {receipt.processada && receipt.dados_extraidos ? (
                    <>
                      {receipt.dados_extraidos.loja?.nome && (
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">Mercado:</span>
                          <span className="text-sm font-medium truncate max-w-[200px]">{receipt.dados_extraidos.loja.nome}</span>
                        </div>
                      )}
                      {receipt.dados_extraidos.valorTotal && (
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">Valor Total:</span>
                          <span className="font-semibold">{formatCurrency(receipt.dados_extraidos.valorTotal)}</span>
                        </div>
                      )}
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
                    <Button variant="outline" size="sm" onClick={() => viewReceipt(receipt)}>
                      <Eye className="w-4 h-4 mr-2" /> {receipt.file_type === 'PDF' && Capacitor.isNativePlatform() ? 'Abrir PDF' : 'Ver Detalhes'}
                    </Button>
                    {(!receipt.processada || (receipt.processada && (!receipt.dados_extraidos?.itens || receipt.dados_extraidos?.itens?.length === 0))) && (receipt.imagem_url || (receipt.dados_extraidos as any)?.imagens_convertidas) && (
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => processReceiptWithAI(receipt)}
                        disabled={processingReceipts.has(receipt.id)}
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                      >
                        {processingReceipts.has(receipt.id) ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Bot className="w-4 h-4 mr-2" />}
                        {processingReceipts.has(receipt.id) ? 'Processando...' : (receipt.processada ? 'Reprocessar' : 'Extrair com IA')}
                      </Button>
                    )}
                    {receipt.processada && (
                      <div className="flex items-center gap-2 text-green-600">
                        <CheckCircle className="h-4 w-4" />
                        <span className="text-sm">Processada ({(receipt.dados_extraidos as any)?.itens?.length || 0} itens)</span>
                      </div>
                    )}
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => deleteReceipt(receipt.id)} className="text-destructive hover:text-destructive">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="p-0 m-0 w-full h-full max-w-full rounded-none overflow-hidden text-xs md:relative md:max-w-md md:rounded-lg md:p-6 md:text-base">
          <DialogTitle className="sr-only">
            {selectedReceipt?.dados_extraidos && selectedReceipt?.processada ? 'Cupom Fiscal Digital' : 'Detalhes da Nota Fiscal'}
          </DialogTitle>
          <div className="w-full h-full overflow-y-auto px-2 py-2 md:px-6 md:py-4">
            {selectedReceipt && (
              <>
                {selectedReceipt.dados_extraidos && selectedReceipt.processada ? (
                  <div className="font-mono space-y-4">
                    {/* Cabeçalho do Estabelecimento */}
                    <div className="text-center border-b pb-4">
                      <h2 className="font-bold text-lg uppercase">
                        {selectedReceipt.dados_extraidos.estabelecimento?.nome || selectedReceipt.dados_extraidos.loja?.nome || 'ESTABELECIMENTO'}
                      </h2>
                      <p className="text-xs">
                        CNPJ: {selectedReceipt.dados_extraidos.estabelecimento?.cnpj || selectedReceipt.dados_extraidos.loja?.cnpj || 'N/A'}
                      </p>
                      <p className="text-xs">
                        {selectedReceipt.dados_extraidos.estabelecimento?.endereco || selectedReceipt.dados_extraidos.loja?.endereco || 'Endereço não informado'}
                      </p>
                    </div>

                    {/* Informações da Nota */}
                    <div className="text-center border-b pb-4 space-y-1">
                      <p><strong>Nota Fiscal de Consumidor Eletrônica</strong></p>
                      <div className="flex justify-between text-xs">
                        <span>Número: {selectedReceipt.dados_extraidos.compra?.numero || selectedReceipt.dados_extraidos.numeroNota || 'N/A'}</span>
                        <span>Série: {selectedReceipt.dados_extraidos.compra?.serie || selectedReceipt.dados_extraidos.serie || 'N/A'}</span>
                      </div>
                      <p className="text-xs">
                        Data: {selectedReceipt.dados_extraidos.compra?.data_emissao || selectedReceipt.dados_extraidos.dataCompra || 'N/A'}
                      </p>
                    </div>

                    {/* Itens da Compra */}
                    <div className="space-y-2">
                      <p className="font-bold text-center">ITENS</p>
                      <div className="border-b">
                        {selectedReceipt.dados_extraidos.itens?.map((item: any, index: number) => (
                          <div key={index} className="py-2 border-b border-dashed last:border-0">
                            <div className="flex justify-between items-start">
                              <div className="flex-1 pr-2">
                                <p className="font-medium text-xs uppercase leading-tight">
                                  {item.descricao || item.nome}
                                </p>
                                {item.codigo && (
                                  <p className="text-xs text-gray-600">Cód: {item.codigo}</p>
                                )}
                              </div>
                            </div>
                            <div className="flex justify-between text-xs mt-1">
                              <span>Qtd: {item.quantidade} {item.unidade}</span>
                              <span>Unit: {formatCurrency(item.valor_unitario || item.preco)}</span>
                              <span className="font-bold">Total: {formatCurrency(item.valor_total || item.preco)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Rodapé */}
                    <div className="border-t pt-4 space-y-2">
                      <div className="flex justify-between text-lg font-bold">
                        <span>TOTAL:</span>
                        <span>{formatCurrency(selectedReceipt.dados_extraidos.compra?.valor_total || selectedReceipt.dados_extraidos.valorTotal || selectedReceipt.total_amount)}</span>
                      </div>
                      <div className="text-center text-xs">
                        <p>Forma de Pagamento: {selectedReceipt.dados_extraidos.compra?.forma_pagamento || selectedReceipt.dados_extraidos.formaPagamento || 'N/A'}</p>
                      </div>
                    </div>

                    {/* Linha final */}
                    <div className="text-center text-xs border-t pt-2">
                      <p>Via do Consumidor</p>
                    </div>
                  </div>
                ) : (
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
                          <span className="font-semibold text-green-600 dark:text-green-400">{formatCurrency(selectedReceipt.total_amount)}</span>
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
                          <img src={selectedReceipt.imagem_url} alt="Imagem da nota fiscal" className="w-full max-h-[500px] object-contain bg-gray-50 dark:bg-gray-900 cursor-pointer" onClick={() => window.open(selectedReceipt.imagem_url!, '_blank')} />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ReceiptList;
