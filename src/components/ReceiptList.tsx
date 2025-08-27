import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Eye, Trash2, FileText, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Configurar worker do PDF com URL mais confiável
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.js',
  import.meta.url,
).toString();


interface Receipt {
  id: string;
  store_name: string | null;
  store_cnpj: string | null;
  total_amount: number | null;
  purchase_date: string | null;
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
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.2);
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

      // Mapear notas_imagens para o formato Receipt
      const mappedNotasImagens = (notasImagensResult.data || []).map(nota => {
        const dadosExtraidos = nota.dados_extraidos as any;
        const fileName = nota.imagem_path ? nota.imagem_path.split('/').pop() : 'Arquivo sem nome';
        
        return {
          id: nota.id,
          store_name: dadosExtraidos?.mercado || fileName || 'Nota enviada',
          store_cnpj: dadosExtraidos?.cnpj || null,
          total_amount: dadosExtraidos?.valor_total || null,
          purchase_date: nota.data_criacao,
          qr_url: dadosExtraidos?.url_original || '',
          status: nota.processada ? 'processed' : 'pending',
          created_at: nota.created_at,
          screenshot_url: nota.imagem_url,
          processed_data: nota.dados_extraidos,
          imagem_url: nota.imagem_url,
          dados_extraidos: nota.dados_extraidos,
          processada: nota.processada,
          file_name: fileName,
          file_type: nota.imagem_path?.toLowerCase().includes('.pdf') ? 'PDF' : 'Imagem'
        };
      });

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
    setPageNumber(1);
    setScale(1.2);
    setIsDialogOpen(true);
  };

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
  };

  const zoomIn = () => setScale(prev => Math.min(prev + 0.2, 3));
  const zoomOut = () => setScale(prev => Math.max(prev - 0.2, 0.5));

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

                {receipt.store_cnpj && (
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">CNPJ:</span>
                    <span className="text-sm font-mono">{receipt.store_cnpj}</span>
                  </div>
                )}
              </div>
              
              <div className="flex justify-between items-center mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => viewReceipt(receipt)}
                >
                  <Eye className="w-4 h-4 mr-2" />
                  Ver Detalhes
                </Button>
                
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
        <DialogContent className="max-w-[95vw] max-h-[95vh] w-full overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes da Nota Fiscal</DialogTitle>
          </DialogHeader>
          
          {selectedReceipt && (
            <div className="space-y-4">
              <div>
                <h4 className="font-semibold mb-2">Informações Gerais</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Estabelecimento:</span>
                    <span>{selectedReceipt.store_name || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">CNPJ:</span>
                    <span className="font-mono">{selectedReceipt.store_cnpj || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total:</span>
                    <span className="font-semibold">{formatCurrency(selectedReceipt.total_amount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Data da compra:</span>
                    <span>{selectedReceipt.purchase_date ? new Date(selectedReceipt.purchase_date).toLocaleDateString('pt-BR') : 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Status:</span>
                    <span>{getStatusBadge(selectedReceipt.status)}</span>
                  </div>
                </div>
              </div>

              {selectedReceipt.imagem_url && (
                <div>
                  <h4 className="font-semibold mb-2">
                    {selectedReceipt.file_type === 'PDF' ? 'Visualizar PDF' : 'Imagem da Nota'}
                  </h4>
                  {selectedReceipt.file_type === 'PDF' ? (
                    <div className="border rounded-lg overflow-hidden">
                      {/* Controles do PDF */}
                      <div className="bg-muted/50 p-3 border-b flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={zoomOut}
                            disabled={scale <= 0.5}
                          >
                            -
                          </Button>
                          <span className="text-sm px-2 min-w-[60px] text-center">{Math.round(scale * 100)}%</span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={zoomIn}
                            disabled={scale >= 3}
                          >
                            +
                          </Button>
                        </div>
                        {numPages > 1 && (
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setPageNumber(prev => Math.max(prev - 1, 1))}
                              disabled={pageNumber <= 1}
                            >
                              ‹
                            </Button>
                            <span className="text-sm px-2 min-w-[80px] text-center">
                              {pageNumber} de {numPages}
                            </span>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setPageNumber(prev => Math.min(prev + 1, numPages))}
                              disabled={pageNumber >= numPages}
                            >
                              ›
                            </Button>
                          </div>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(selectedReceipt.imagem_url, '_blank')}
                        >
                          Abrir Externo
                        </Button>
                      </div>
                      
                      {/* Visualizador do PDF */}
                      <div className="max-h-[60vh] overflow-auto bg-gray-50 p-4 flex justify-center">
                        <Document
                          file={selectedReceipt.imagem_url}
                          onLoadSuccess={onDocumentLoadSuccess}
                          onLoadError={(error) => {
                            console.error('Erro ao carregar PDF:', error);
                            toast({
                              title: "Erro no PDF",
                              description: "Não foi possível carregar o PDF. Tente abrir no navegador.",
                              variant: "destructive",
                            });
                          }}
                          loading={
                            <div className="flex flex-col items-center justify-center p-8 min-h-[200px]">
                              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-2"></div>
                              <p className="text-sm text-muted-foreground">Carregando PDF...</p>
                            </div>
                          }
                          error={
                            <div className="text-center p-8 min-h-[200px] flex flex-col items-center justify-center">
                              <FileText className="w-12 h-12 mx-auto mb-2 text-muted-foreground" />
                              <p className="text-sm text-muted-foreground mb-2">Erro ao carregar PDF</p>
                              <p className="text-xs text-muted-foreground mb-4 max-w-sm">
                                O PDF pode estar corrompido ou em um formato não suportado
                              </p>
                              <div className="space-y-2">
                                <Button
                                  variant="outline"
                                  onClick={() => window.open(selectedReceipt.imagem_url, '_blank')}
                                >
                                  Abrir no navegador
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    // Força recarregamento
                                    setPageNumber(1);
                                    setScale(1.2);
                                  }}
                                >
                                  Tentar novamente
                                </Button>
                              </div>
                            </div>
                          }
                          options={{
                            cMapUrl: 'https://unpkg.com/pdfjs-dist@3.11.174/cmaps/',
                            cMapPacked: true,
                          }}
                        >
                          <Page
                            pageNumber={pageNumber}
                            scale={scale}
                            renderTextLayer={false}
                            renderAnnotationLayer={false}
                            onRenderError={(error) => {
                              console.error('Erro ao renderizar página:', error);
                            }}
                          />
                        </Document>
                      </div>
                    </div>
                  ) : (
                    <img 
                      src={selectedReceipt.imagem_url} 
                      alt="Imagem da nota fiscal"
                      className="w-full max-h-[400px] object-contain rounded-lg border cursor-pointer"
                      onClick={() => window.open(selectedReceipt.imagem_url, '_blank')}
                    />
                  )}
                </div>
              )}

              <div className="flex gap-2">
                {selectedReceipt.qr_url && (
                  <Button
                    variant="outline"
                    onClick={() => window.open(selectedReceipt.qr_url, '_blank')}
                    className="flex-1"
                  >
                    Abrir QR Original
                  </Button>
                )}
                {selectedReceipt.imagem_url && (
                  <Button
                    variant="outline"
                    onClick={() => window.open(selectedReceipt.imagem_url, '_blank')}
                    className="flex-1"
                  >
                    Abrir Arquivo
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ReceiptList;