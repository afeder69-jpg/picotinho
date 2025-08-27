import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Eye, Trash2, FileText } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';


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
  const { toast } = useToast();

  useEffect(() => {
    loadReceipts();
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
      // Tentar deletar de ambas as tabelas (uma falhará, mas não é problema)
      const [receiptsResult, notasImagensResult] = await Promise.all([
        supabase.from('receipts').delete().eq('id', id),
        supabase.from('notas_imagens').delete().eq('id', id)
      ]);

      // Se ambas falharam, throw error
      if (receiptsResult.error && notasImagensResult.error) {
        throw receiptsResult.error;
      }

      setReceipts(receipts.filter(r => r.id !== id));
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
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
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
                    {selectedReceipt.file_type === 'PDF' ? 'Arquivo PDF' : 'Imagem da Nota'}
                  </h4>
                  {selectedReceipt.file_type === 'PDF' ? (
                    <div className="border rounded-lg p-4 text-center">
                      <FileText className="w-12 h-12 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground mb-2">Arquivo PDF</p>
                      <Button
                        variant="outline"
                        onClick={() => window.open(selectedReceipt.imagem_url, '_blank')}
                        className="w-full"
                      >
                        Abrir PDF
                      </Button>
                    </div>
                  ) : (
                    <img 
                      src={selectedReceipt.imagem_url} 
                      alt="Imagem da nota fiscal"
                      className="w-full rounded-lg border cursor-pointer"
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