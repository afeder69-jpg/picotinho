import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2, Receipt, Store, Calendar, DollarSign, Bell } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import type { NotaPendente } from "@/hooks/useNotasPendentesAprovacao";

interface NotaPendenteModalProps {
  nota: NotaPendente;
  onClose: () => void;
}

const NotaPendenteModal = ({ nota, onClose }: NotaPendenteModalProps) => {
  const [isConfirming, setIsConfirming] = useState(false);
  const [isCanceling, setIsCanceling] = useState(false);

  const formatarData = (dataStr: string) => {
    try {
      const data = new Date(dataStr);
      return format(data, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
    } catch {
      return "Data inválida";
    }
  };

  const formatarValor = (valor: number | undefined) => {
    if (!valor) return "R$ 0,00";
    return `R$ ${valor.toFixed(2).replace(".", ",")}`;
  };

  const gerarPDF = async (): Promise<string | null> => {
    try {
      const cupomElement = document.querySelector('[data-nota-pendente]') as HTMLElement;
      if (!cupomElement) throw new Error("Elemento não encontrado");

      const canvas = await html2canvas(cupomElement, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const imgWidth = 210;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      pdf.addImage(imgData, "PNG", 0, 0, imgWidth, imgHeight);

      const pdfBlob = pdf.output("blob");
      const fileName = `nota_${nota.id}.pdf`;
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("receipts")
        .upload(fileName, pdfBlob, { contentType: "application/pdf", upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("receipts").getPublicUrl(fileName);
      return urlData.publicUrl;
    } catch (error: any) {
      console.error("Erro ao gerar PDF:", error);
      return null;
    }
  };

  const handleConfirmar = async () => {
    setIsConfirming(true);
    try {
      const pdfUrl = await gerarPDF();
      if (!pdfUrl) throw new Error("Falha ao gerar PDF");

      // Validar nota
      const { data: validationData, error: validationError } = await supabase.functions.invoke(
        "validate-receipt",
        { body: { notaImagemId: nota.id, userId: nota.dados_extraidos?.usuario_id, pdfUrl, fromInfoSimples: true }}
      );

      if (validationError) throw validationError;

      if (!validationData?.approved) {
        toast({
          title: validationData?.reason === 'duplicada' ? "⚠️ Nota Duplicada" : "❌ Nota inválida",
          description: validationData?.message || "A nota não passou na validação",
          variant: "destructive",
        });
        return;
      }

      // Marcar como aprovada
      await supabase
        .from('notas_imagens')
        .update({ status_aprovacao: 'aprovada' })
        .eq('id', nota.id);

      // Processar estoque em background
      supabase.functions.invoke("process-receipt-full", {
        body: { notaId: nota.id, userId: nota.dados_extraidos?.usuario_id }
      });

      toast({ title: "✅ Nota confirmada!", description: "Processando estoque..." });
      onClose();

    } catch (error: any) {
      toast({ title: "Erro ao confirmar", description: error.message, variant: "destructive" });
    } finally {
      setIsConfirming(false);
    }
  };

  const handleCancelar = async () => {
    setIsCanceling(true);
    try {
      await supabase
        .from("notas_imagens")
        .update({ status_aprovacao: 'cancelada' })
        .eq("id", nota.id);

      toast({ title: "Nota cancelada" });
      onClose();
    } catch (error: any) {
      toast({ title: "Erro ao cancelar", description: error.message, variant: "destructive" });
    } finally {
      setIsCanceling(false);
    }
  };

  const estabelecimento = nota.dados_extraidos?.estabelecimento || nota.dados_extraidos?.emitente;
  const produtos = nota.dados_extraidos?.itens || nota.dados_extraidos?.produtos || [];

  return (
    <Dialog open={true} onOpenChange={() => {}}>
      <DialogContent 
        className="!w-full !h-full overflow-y-auto !p-0"
        data-nota-pendente
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        {/* Notificação de nota pronta */}
        <div className="bg-yellow-50 dark:bg-yellow-950 p-4 border-b-2 border-yellow-300 dark:border-yellow-700">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-yellow-600 dark:text-yellow-400 animate-pulse" />
            <p className="text-sm font-semibold text-yellow-800 dark:text-yellow-200">
              📬 Nota Fiscal Pronta para Validação
            </p>
          </div>
        </div>

        {/* Logo Picotinho */}
        <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950 dark:to-green-900 p-6 text-center border-b-2 border-dashed border-green-300">
          <img src="/lovable-uploads/Logo_Picotinho_pq_png-3.png" alt="Picotinho" className="w-12 h-12 mx-auto mb-2" />
          <h2 className="text-lg font-bold text-green-800 dark:text-green-200">CUPOM FISCAL ELETRÔNICO</h2>
        </div>

        {/* Estabelecimento */}
        <div className="p-4 space-y-3 border-b border-dashed">
          <div className="flex items-start gap-2">
            <Store className="w-4 h-4 text-muted-foreground mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-sm">{estabelecimento?.nome || "Estabelecimento"}</p>
              {estabelecimento?.cnpj && (
                <p className="text-xs text-muted-foreground font-mono">CNPJ: {estabelecimento.cnpj}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Calendar className="w-3.5 h-3.5" />
            <span>{formatarData(nota.dados_extraidos?.data_emissao || nota.created_at)}</span>
          </div>
        </div>

        {/* Produtos */}
        <div className="p-4 space-y-2">
          <div className="flex items-center gap-2 mb-3">
            <Receipt className="w-4 h-4" />
            <h3 className="font-semibold text-sm">Itens da Nota</h3>
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {produtos.map((produto: any, index: number) => (
              <div key={index} className="bg-muted/30 p-2.5 rounded-lg border">
                <div className="flex justify-between gap-2">
                  <p className="text-xs font-medium flex-1">{produto.descricao || "Produto"}</p>
                  <p className="text-xs font-bold text-primary">{formatarValor(produto.valor_total)}</p>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {produto.quantidade} {produto.unidade || "UN"} × {formatarValor(produto.valor_unitario)}
                </p>
              </div>
            ))}
          </div>

          <Separator className="my-4" />

          {/* Total */}
          <div className="bg-primary/10 p-3 rounded-lg border border-primary/20">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-primary" />
                <span className="font-bold text-sm">VALOR TOTAL</span>
              </div>
              <span className="font-bold text-lg text-primary">
                {formatarValor(nota.dados_extraidos?.valor_total)}
              </span>
            </div>
          </div>
        </div>

        {/* Botões */}
        <div className="p-4 bg-muted/30 border-t space-y-2">
          <Button onClick={handleConfirmar} disabled={isConfirming || isCanceling} className="w-full bg-green-600 hover:bg-green-700" size="lg">
            {isConfirming ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Processando...</> : "✓ Confirmar e Adicionar ao Estoque"}
          </Button>
          <Button onClick={handleCancelar} disabled={isConfirming || isCanceling} variant="outline" className="w-full" size="sm">
            {isCanceling ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Cancelando...</> : "✕ Cancelar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default NotaPendenteModal;
