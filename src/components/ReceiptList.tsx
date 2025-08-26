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

      const { data, error } = await supabase
        .from('receipts')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setReceipts(data || []);
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
      const { error } = await supabase
        .from('receipts')
        .delete()
        .eq('id', id);

      if (error) throw error;

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

              {selectedReceipt.screenshot_url && (
                <div>
                  <h4 className="font-semibold mb-2">Screenshot</h4>
                  <img 
                    src={selectedReceipt.screenshot_url} 
                    alt="Screenshot da nota fiscal"
                    className="w-full rounded-lg border"
                  />
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => window.open(selectedReceipt.qr_url, '_blank')}
                  className="flex-1"
                >
                  Abrir QR Original
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ReceiptList;