import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Check, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { TipoDocumento } from '@/lib/documentDetection';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import PicotinhoLogo from '@/components/PicotinhoLogo';

interface SimplifiedInAppBrowserProps {
  notaId: string;
  dadosExtraidos: any;
  userId: string;
  tipoDocumento: TipoDocumento;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export const SimplifiedInAppBrowser = ({
  notaId,
  dadosExtraidos,
  userId,
  tipoDocumento,
  isOpen,
  onClose,
  onConfirm,
}: SimplifiedInAppBrowserProps) => {
  const [isProcessing, setIsProcessing] = useState(false);

  const formatarData = (dataStr: string) => {
    if (!dataStr) return 'Data não disponível';
    
    try {
      const data = new Date(dataStr);
      
      // Validar se a data é válida
      if (isNaN(data.getTime())) {
        console.error('Data inválida:', dataStr);
        return dataStr;
      }
      
      return format(data, "dd/MM/yyyy HH:mm:ss", { locale: ptBR });
    } catch (error) {
      console.error('Erro ao formatar data:', error, dataStr);
      return dataStr;
    }
  };

  const formatarValor = (valor: number | undefined) => {
    if (!valor) return 'R$ 0,00';
    return `R$ ${valor.toFixed(2).replace('.', ',')}`;
  };

  const handleConfirm = async () => {
    setIsProcessing(true);
    
    try {
      console.log('✅ [CONFIRM] Iniciando validação e processamento:', notaId);

      console.log('✅ [CUPOM] Confirmando nota e processando estoque...');

      // PASSO 1: Validar a nota InfoSimples (verificar duplicidade, chave de acesso)
      // ⚠️ CORREÇÃO: Notas InfoSimples não têm imageUrl, apenas dados_extraidos
      const { data: validationResult, error: validationError } = await supabase.functions.invoke('validate-receipt', {
        body: {
          notaImagemId: notaId,
          userId,
          fromInfoSimples: true,
        },
      });

      if (validationError) throw validationError;

      if (!validationResult.approved) {
        console.warn('❌ Nota reprovada na validação:', validationResult.reason);
        toast({
          title: validationResult.reason === 'duplicada' 
            ? "⚠️ Nota Duplicada" 
            : "❌ Nota não aprovada",
          description: validationResult.message,
          variant: "destructive",
          duration: 5000,
        });
        setIsProcessing(false);
        return;
      }

      console.log('✅ Nota aprovada na validação');

      // PASSO 3: Processar a nota (categorizar, normalizar, adicionar ao estoque)
      console.log('⚙️ Processando nota...');
      const { data: processResult, error: processError } = await supabase.functions.invoke('process-receipt-full', {
        body: {
          imagemId: notaId,
          force: false,
        },
      });

      if (processError) throw processError;

      console.log('✅ Nota processada com sucesso:', processResult);

      toast({
        title: "✅ Nota adicionada ao estoque",
        description: `${processResult.itens_inseridos} produtos adicionados`,
      });

      onConfirm();

    } catch (error: any) {
      console.error('❌ [ERRO] Falha ao processar nota:', error);
      
      toast({
        title: "Erro ao processar nota",
        description: error.message || "Tente novamente",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancel = async () => {
    console.log('❌ [CANCEL] Cancelando e deletando nota não confirmada');
    
    try {
      // Deletar a nota de notas_imagens
      const { error } = await supabase
        .from('notas_imagens')
        .delete()
        .eq('id', notaId);
      
      if (error) {
        console.error('❌ Erro ao deletar nota:', error);
        toast({
          title: "Aviso",
          description: "Não foi possível limpar a nota do sistema",
          variant: "destructive",
        });
      } else {
        console.log('✅ Nota deletada com sucesso');
        toast({
          title: "Nota descartada",
          description: "A nota foi removida do sistema",
        });
      }
    } catch (error) {
      console.error('❌ Erro ao deletar nota:', error);
    }
    
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) return; }}>
      <DialogContent 
        className="max-w-full w-full h-full p-0 gap-0"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogTitle className="sr-only">Nota Fiscal</DialogTitle>
        <DialogDescription className="sr-only">
          Visualize os dados da nota fiscal e confirme para adicionar ao estoque
        </DialogDescription>
        
        {/* Conteúdo da Nota */}
        <div className="relative w-full h-full overflow-y-auto bg-background">
          <div className="p-6 max-w-2xl mx-auto pb-32">
            {/* Cabeçalho */}
            <div className="mb-6 pb-4 border-b">
              <div className="flex justify-between items-start mb-2">
                <h2 className="text-2xl font-bold flex-1">
                  {dadosExtraidos?.estabelecimento?.nome || 'Nota Fiscal'}
                </h2>
                <PicotinhoLogo size="md" className="ml-2" />
              </div>
              <div className="space-y-1 text-sm text-muted-foreground">
                <p><span className="font-medium">CNPJ:</span> {dadosExtraidos?.estabelecimento?.cnpj || 'N/A'}</p>
                <p><span className="font-medium">Data:</span> {dadosExtraidos?.data_emissao ? formatarData(dadosExtraidos.data_emissao) : 'N/A'}</p>
                <p><span className="font-medium">Total:</span> <span className="text-lg font-bold text-foreground">{formatarValor(dadosExtraidos?.valor_total)}</span></p>
              </div>
            </div>

            {/* Lista de Produtos */}
            <div>
              <h3 className="text-xl font-semibold mb-4">
                Produtos ({dadosExtraidos?.produtos?.length || 0})
              </h3>
              <div className="space-y-3">
                {dadosExtraidos?.produtos?.map((produto: any, idx: number) => (
                  <div key={idx} className="border rounded-lg p-4 bg-card">
                    <p className="font-medium mb-2">{produto.nome}</p>
                    <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                      <p><span className="font-medium">Qtd:</span> {produto.quantidade}</p>
                      <p><span className="font-medium">Unit:</span> {formatarValor(produto.valor_unitario)}</p>
                      <p className="col-span-2">
                        <span className="font-medium">Total:</span> 
                        <span className="text-base font-bold text-foreground ml-2">
                          {formatarValor(produto.valor_total)}
                        </span>
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Informações Adicionais */}
            {dadosExtraidos?.forma_pagamento && (
              <div className="mt-6 p-4 bg-muted rounded-lg">
                <p className="text-sm">
                  <span className="font-medium">Forma de Pagamento:</span>{' '}
                  {dadosExtraidos.forma_pagamento}
                </p>
              </div>
            )}
          </div>
          
          {/* Botões Flutuantes */}
          <div className="fixed bottom-4 left-0 right-0 z-[9999]">
            <div className="flex justify-center items-center gap-3 w-full px-4 pb-safe">
              {/* Botão Cancelar */}
              <Button
                variant="destructive"
                size="lg"
                className="h-14 flex-1 max-w-xs rounded-lg shadow-2xl"
                onClick={handleCancel}
                disabled={isProcessing}
              >
                <X className="w-6 h-6 mr-2" />
                <span>Cancelar</span>
              </Button>

              {/* Botão Confirmar */}
              <Button
                variant="default"
                size="lg"
                className="h-14 flex-1 max-w-xs rounded-lg bg-green-600 hover:bg-green-700 shadow-2xl disabled:opacity-50"
                onClick={handleConfirm}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <>
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white mr-2" />
                    <span>Processando...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-6 h-6 mr-2" />
                    <span>Confirmar e Adicionar</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
