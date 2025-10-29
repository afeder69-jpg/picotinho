import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2, Receipt, Store, Calendar, DollarSign } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface CupomFiscalViewerProps {
  notaId: string;
  dadosExtraidos: any;
  userId: string;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

const CupomFiscalViewer = ({
  notaId,
  dadosExtraidos,
  userId,
  isOpen,
  onClose,
  onConfirm,
}: CupomFiscalViewerProps) => {
  const [isConfirming, setIsConfirming] = useState(false);
  const [isCanceling, setIsCanceling] = useState(false);

  const formatarData = (dataStr: string | null | undefined) => {
    if (!dataStr) return "Data não disponível";
    try {
      const data = new Date(dataStr);
      return format(data, "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR });
    } catch {
      return dataStr;
    }
  };

  const formatarValor = (valor: number | undefined) => {
    if (valor === undefined || valor === null) return "R$ 0,00";
    return `R$ ${valor.toFixed(2).replace(".", ",")}`;
  };

  const handleConfirmar = async () => {
    setIsConfirming(true);
    try {
      console.log("✅ [CUPOM] Confirmando nota e processando estoque...");

      // 1. Validar nota via validate-receipt
      const { data: validationData, error: validationError } = await supabase.functions.invoke(
        "validate-receipt",
        {
          body: {
            notaImagemId: notaId,
            userId: userId,
          },
        }
      );

      if (validationError) throw validationError;
      
      console.log("📋 Resultado da validação:", validationData);

      if (!validationData?.approved) {
        toast({
          title: "❌ Nota inválida",
          description: validationData?.message || "A nota não passou na validação",
          variant: "destructive",
        });
        return;
      }

      // 2. Processar estoque via process-receipt-full
      const { data: processData, error: processError } = await supabase.functions.invoke(
        "process-receipt-full",
        {
          body: {
            notaId: notaId,
            userId: userId,
          },
        }
      );

      if (processError) throw processError;

      console.log("✅ Estoque processado:", processData);

      toast({
        title: "✅ Nota processada com sucesso!",
        description: `${processData?.itens_inseridos || 0} itens adicionados ao estoque`,
      });

      onConfirm();
    } catch (error: any) {
      console.error("❌ Erro ao confirmar nota:", error);
      toast({
        title: "Erro ao processar nota",
        description: error.message || "Tente novamente",
        variant: "destructive",
      });
    } finally {
      setIsConfirming(false);
    }
  };

  const handleCancelar = async () => {
    setIsCanceling(true);
    try {
      console.log("❌ [CUPOM] Cancelando nota...");

      // Deletar nota do banco
      const { error } = await supabase
        .from("notas_imagens")
        .delete()
        .eq("id", notaId);

      if (error) throw error;

      toast({
        title: "Nota cancelada",
        description: "A nota foi removida",
      });

      onClose();
    } catch (error: any) {
      console.error("❌ Erro ao cancelar:", error);
      toast({
        title: "Erro ao cancelar",
        description: error.message || "Tente novamente",
        variant: "destructive",
      });
    } finally {
      setIsCanceling(false);
    }
  };

  const estabelecimento = dadosExtraidos?.estabelecimento || dadosExtraidos?.emitente;
  const produtos = dadosExtraidos?.produtos || [];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto p-0">
        {/* Cabeçalho - Logo Picotinho */}
        <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950 dark:to-green-900 p-6 text-center border-b-2 border-dashed border-green-300 dark:border-green-700">
          <img
            src="/lovable-uploads/Logo_Picotinho_pq_png-3.png"
            alt="Picotinho"
            className="w-12 h-12 mx-auto mb-2"
          />
          <h2 className="text-lg font-bold text-green-800 dark:text-green-200">
            CUPOM FISCAL ELETRÔNICO
          </h2>
          <p className="text-xs text-green-600 dark:text-green-400 mt-1">
            Não é documento fiscal
          </p>
        </div>

        {/* Informações do Estabelecimento */}
        <div className="p-4 space-y-3 border-b border-dashed border-border">
          <div className="flex items-start gap-2">
            <Store className="w-4 h-4 text-muted-foreground mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm truncate">
                {estabelecimento?.nome || "Estabelecimento não identificado"}
              </p>
              {estabelecimento?.cnpj && (
                <p className="text-xs text-muted-foreground font-mono">
                  CNPJ: {estabelecimento.cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5")}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Calendar className="w-3.5 h-3.5" />
            <span>{formatarData(dadosExtraidos?.data_emissao)}</span>
          </div>

          {dadosExtraidos?.chave_acesso && (
            <div className="bg-muted/50 p-2 rounded text-xs">
              <p className="text-[10px] text-muted-foreground mb-1">Chave de Acesso:</p>
              <p className="font-mono text-[10px] break-all leading-tight">
                {dadosExtraidos.chave_acesso}
              </p>
            </div>
          )}
        </div>

        {/* Lista de Produtos */}
        <div className="p-4 space-y-2">
          <div className="flex items-center gap-2 mb-3">
            <Receipt className="w-4 h-4 text-muted-foreground" />
            <h3 className="font-semibold text-sm">Itens da Nota</h3>
          </div>

          <div className="space-y-2 max-h-64 overflow-y-auto">
            {produtos.map((produto: any, index: number) => (
              <div
                key={index}
                className="bg-muted/30 p-2.5 rounded-lg border border-border/50 space-y-1"
              >
                <div className="flex justify-between items-start gap-2">
                  <p className="text-xs font-medium flex-1 leading-tight">
                    {produto.nome || produto.descricao || "Produto sem nome"}
                  </p>
                  <p className="text-xs font-bold text-primary whitespace-nowrap">
                    {formatarValor(produto.valor_total)}
                  </p>
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>
                    {produto.quantidade} {produto.unidade || "UN"} × {formatarValor(produto.valor_unitario)}
                  </span>
                  {produto.tem_desconto && (
                    <span className="text-green-600 dark:text-green-400 font-medium">
                      🏷️ Desconto
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          <Separator className="my-4" />

          {/* Total */}
          <div className="bg-gradient-to-r from-primary/10 to-primary/5 p-3 rounded-lg border border-primary/20">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-primary" />
                <span className="font-bold text-sm">VALOR TOTAL</span>
              </div>
              <span className="font-bold text-lg text-primary">
                {formatarValor(dadosExtraidos?.valor_total)}
              </span>
            </div>
          </div>

          <p className="text-[10px] text-center text-muted-foreground mt-3">
            {produtos.length} {produtos.length === 1 ? "item" : "itens"} na nota
          </p>
        </div>

        {/* Rodapé - Botões de Ação */}
        <div className="p-4 bg-muted/30 border-t border-dashed border-border space-y-2">
          <Button
            onClick={handleConfirmar}
            disabled={isConfirming || isCanceling}
            className="w-full bg-green-600 hover:bg-green-700"
            size="lg"
          >
            {isConfirming ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Processando...
              </>
            ) : (
              "✓ Confirmar e Adicionar ao Estoque"
            )}
          </Button>

          <Button
            onClick={handleCancelar}
            disabled={isConfirming || isCanceling}
            variant="outline"
            className="w-full"
            size="sm"
          >
            {isCanceling ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Cancelando...
              </>
            ) : (
              "✕ Cancelar"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CupomFiscalViewer;
