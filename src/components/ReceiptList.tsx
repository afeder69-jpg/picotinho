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
        supabase.from('notas_imagens').select('*').eq('usuario_id', user.id).order('created_at', { ascending: false })
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
            file_type: isPdfWithConversion ? 'PDF (convertido)' : (nota.imagem_path?.toLowerCase().includes('.pdf') ? 'PDF' : 'Imagem')
          };
        })
        .filter(nota => nota !== null);

      const allReceipts = [
        ...(receiptsResult.data || []),
        ...mappedNotasImagens
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

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
    setSelectedReceipt(receipt);
    setIsDialogOpen(true);
  };

  const processReceiptWithAI = async (receipt: Receipt) => {
    if (processingReceipts.has(receipt.id)) return;

    try {
      setProcessingReceipts(prev => new Set(prev).add(receipt.id));
      toast({ title: "Processando nota fiscal", description: "A IA está analisando os dados da nota..." });

      let processedSuccessfully = false;
      const isPDF = receipt.file_type?.toLowerCase().includes('pdf') || receipt.imagem_url?.toLowerCase().endsWith('.pdf');

      if (isPDF) {
        const pdfResponse = await supabase.functions.invoke('process-receipt-pdf', {
          body: { notaImagemId: receipt.id, pdfUrl: receipt.imagem_url, userId: (await supabase.auth.getUser()).data.user?.id }
        });

        if (pdfResponse.error) throw new Error(pdfResponse.error.message || "Erro no Supabase");
        if (!pdfResponse.data?.success) throw new Error(pdfResponse.data?.message || "Falha no processamento do PDF");

        toast({ title: "PDF processado com sucesso!", description: `${pdfResponse.data.itens_extraidos || 0} itens extraídos.` });
        processedSuccessfully = true;

      } else {
        const response = await supabase.functions.invoke('process-receipt-ai', {
          body: { notaId: receipt.id, imageUrl: receipt.imagem_url }
        });

        if (response.error) throw new Error(response.error.message || "Erro no Supabase");
        if (!response.data?.success) throw new Error(response.data?.message || "Falha no processamento da imagem");

        toast({ title: "Imagem processada com sucesso!", description: `${response.data.itens_extraidos || 0} itens extraídos.` });
        processedSuccessfully = true;
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
                    {!receipt.processada && (receipt.imagem_url || (receipt.dados_extraidos as any)?.imagens_convertidas) && (
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => processReceiptWithAI(receipt)}
                        disabled={processingReceipts.has(receipt.id)}
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                      >
                        {processingReceipts.has(receipt.id) ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Bot className="w-4 h-4 mr-2" />}
                        {processingReceipts.has(receipt.id) ? 'Processando...' : 'Extrair com IA'}
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
        <DialogContent className={`${Capacitor.isNativePlatform() ? 'fixed inset-0 max-w-none max-h-none w-screen h-screen m-0 p-0 rounded-none border-0' : 'max-w-[95vw] max-h-[95vh] w-full'} overflow-hidden flex flex-col`}>
          <DialogHeader className={`flex-shrink-0 ${Capacitor.isNativePlatform() ? 'p-2' : 'p-4'} border-b bg-background`}>
            <div className="flex items-center justify-between">
              <DialogTitle className="text-base">Detalhes da Nota Fiscal</DialogTitle>
              {Capacitor.isNativePlatform() && (
                <Button variant="ghost" size="sm" onClick={() => setIsDialogOpen(false)} className="p-1">
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>
          </DialogHeader>
          {selectedReceipt && (
            <div className="flex-1 overflow-hidden">
              {selectedReceipt.file_type === 'PDF' && selectedReceipt.imagem_url ? (
                <div className="h-full flex flex-col">
                  <div className="flex-1 relative">
                    {Capacitor.isNativePlatform() ? (
                      <div className="w-full h-full bg-white">
                        <embed src={selectedReceipt.imagem_url} type="application/pdf" className="w-full h-full" style={{ minHeight: '100%' }} />
                        <div className="absolute inset-0 flex items-center justify-center bg-muted/90 backdrop-blur-sm">
                          <div className="text-center space-y-4 p-6">
                            <FileText className="w-12 h-12 mx-auto text-muted-foreground" />
                            <div>
                              <h3 className="font-semibold mb-2">Visualizar PDF</h3>
                              <p className="text-sm text-muted-foreground mb-4">Toque para abrir o arquivo PDF</p>
                              <div className="space-y-2">
                                <Button onClick={() => Browser.open({ url: selectedReceipt.imagem_url!, windowName: '_blank' })} className="w-full">
                                  <Eye className="w-4 h-4 mr-2" /> Abrir PDF
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <iframe src={`${selectedReceipt.imagem_url}#toolbar=1&navpanes=1&scrollbar=1&zoom=page-width`} className="w-full h-full border-0" title="Visualizador de PDF" style={{ minHeight: '70vh' }} />
                    )}
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
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ReceiptList;
