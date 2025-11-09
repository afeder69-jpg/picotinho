import { Dialog, DialogContent, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useState, useLayoutEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2, Receipt, Store, Calendar, DollarSign } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

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
  const dialogRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (isOpen && dialogRef.current) {
      const applyStyles = () => {
        if (dialogRef.current) {
          const element = dialogRef.current;
          element.style.width = '100vw';
          element.style.height = '100dvh';
          element.style.maxWidth = '100vw';
          element.style.maxHeight = '100dvh';
        }
      };

      // Double requestAnimationFrame para garantir que Radix UI terminou suas animações
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          applyStyles();
        });
      });

      // Fallback de 50ms caso os requestAnimationFrame falhem
      const timeoutId = setTimeout(() => {
        applyStyles();
      }, 50);

      return () => clearTimeout(timeoutId);
    }
  }, [isOpen]);
  const [isCanceling, setIsCanceling] = useState(false);

  const formatarData = (dataStr: string | null | undefined) => {
    if (!dataStr) return "Data não disponível";
    
    try {
      let data: Date;
      
      // Caso 1: Formato brasileiro DD/MM/YYYY HH:mm:ss
      if (dataStr.includes('/')) {
        const partes = dataStr.split(' ');
        const dataParte = partes[0]; // "26/10/2025"
        const horaParte = partes[1]?.split('-')[0] || '00:00:00'; // "12:35:25" (remove timezone)
        
        const [dia, mes, ano] = dataParte.split('/');
        
        // Validar que temos todos os componentes
        if (dia && mes && ano) {
          data = new Date(`${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}T${horaParte}`);
        } else {
          return "Data inválida";
        }
      }
      // Caso 2: Formato ISO (2025-10-04T09:43:14 ou 2025-10-04T09:43:14.000Z)
      else {
        data = new Date(dataStr);
      }
      
      // Validar data
      if (isNaN(data.getTime())) {
        console.warn('⚠️ Data inválida:', dataStr);
        return "Data inválida";
      }
      
      // Formatar: 04/10/2025 às 09:43
      return format(data, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
      
    } catch (error) {
      console.error('❌ Erro ao formatar data:', dataStr, error);
      return "Erro na data";
    }
  };

  const formatarValor = (valor: number | undefined) => {
    if (valor === undefined || valor === null) return "R$ 0,00";
    return `R$ ${valor.toFixed(2).replace(".", ",")}`;
  };

  // 🔥 Função para gerar PDF a partir do cupom HTML e fazer upload
  const gerarEUploadPDF = async (): Promise<string | null> => {
    try {
      console.log("📄 [PDF] Iniciando geração de PDF...");

      // 1. Capturar o DOM do cupom
      const cupomElement = document.querySelector('[data-cupom-fiscal]') as HTMLElement;
      if (!cupomElement) {
        throw new Error("Elemento do cupom não encontrado");
      }

      // 2. Converter para canvas
      const canvas = await html2canvas(cupomElement, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
      });

      // 3. Criar PDF com jsPDF
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      const imgWidth = 210; // A4 width in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      pdf.addImage(imgData, "PNG", 0, 0, imgWidth, imgHeight);

      // 4. Converter PDF para Blob
      const pdfBlob = pdf.output("blob");

      // 5. Upload para Storage (bucket 'receipts')
      const fileName = `${userId}/temp_nfce_${notaId}.pdf`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("receipts")
        .upload(fileName, pdfBlob, {
          contentType: "application/pdf",
          upsert: true,
        });

      if (uploadError) throw uploadError;

      // 6. Obter URL pública
      const { data: urlData } = supabase.storage
        .from("receipts")
        .getPublicUrl(fileName);

      const pdfUrl = urlData.publicUrl;

      // 7. Atualizar notas_imagens com a URL do PDF
      const { error: updateError } = await supabase
        .from("notas_imagens")
        .update({ pdf_url: pdfUrl, pdf_gerado: true })
        .eq("id", notaId);

      if (updateError) throw updateError;

      console.log("✅ [PDF] PDF gerado e salvo:", pdfUrl);
      return pdfUrl;
    } catch (error: any) {
      console.error("❌ [PDF] Erro ao gerar PDF:", error);
      toast({
        title: "Erro ao gerar PDF",
        description: error.message,
        variant: "destructive",
      });
      return null;
    }
  };

  const handleConfirmar = async () => {
    setIsConfirming(true);
    try {
      console.log("✅ [CUPOM] Confirmando nota e processando estoque...");

      // 1. Gerar PDF temporário
      const pdfUrl = await gerarEUploadPDF();
      if (!pdfUrl) {
        throw new Error("Falha ao gerar PDF");
      }

      // 2. Validar nota via validate-receipt (passando pdfUrl)
      const { data: validationData, error: validationError } = await supabase.functions.invoke(
        "validate-receipt",
        {
          body: {
            notaImagemId: notaId,
            userId: userId,
            pdfUrl: pdfUrl,
            fromInfoSimples: true,
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

      // 3. ✅ FECHAR MODAL E REDIRECIONAR IMEDIATAMENTE
      toast({
        title: "✅ Nota aceita!",
        description: "Processando estoque em segundo plano...",
      });
      
      onConfirm(); // ← Chamado ANTES do processamento completo
      
      // 4. Processar estoque em background (não bloqueante)
      supabase.functions.invoke("process-receipt-full", {
        body: { notaId, userId }
      }).then(({ data: processData, error: processError }) => {
        if (processError) {
          console.error("❌ Erro ao processar estoque:", processError);
          return;
        }
        
        console.log("✅ Estoque processado:", processData);
        
        // 5. Deletar PDF temporário em background
        if (pdfUrl) {
          const fileName = `${userId}/temp_nfce_${notaId}.pdf`;
          supabase.storage.from("receipts").remove([fileName])
            .then(() => console.log("✅ PDF temporário deletado"))
            .catch((err) => console.warn("⚠️ Erro ao deletar PDF:", err));
          
          supabase
            .from("notas_imagens")
            .update({ pdf_url: null })
            .eq("id", notaId)
            .then(() => console.log("✅ pdf_url limpo do banco"));
        }
      });

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
    console.log("🔴 [CUPOM] handleCancelar INICIADO");
    setIsCanceling(true);
    try {
      console.log("❌ [CUPOM] Cancelando nota...");

      // Deletar nota do banco
      const { error } = await supabase
        .from("notas_imagens")
        .delete()
        .eq("id", notaId);

      if (error) throw error;

      console.log("✅ [CUPOM] Nota deletada com sucesso");

      toast({
        title: "Nota cancelada",
        description: "A nota foi removida",
      });

      console.log("🔴 [CUPOM] Chamando onClose()");
      onClose();
    } catch (error: any) {
      console.error("❌ Erro ao cancelar:", error);
      toast({
        title: "Erro ao cancelar",
        description: error.message || "Tente novamente",
        variant: "destructive",
      });
    } finally {
      console.log("🔴 [CUPOM] handleCancelar FINALIZADO");
      setIsCanceling(false);
    }
  };

  const estabelecimento = dadosExtraidos?.estabelecimento || dadosExtraidos?.emitente;
  const produtos = dadosExtraidos?.itens || dadosExtraidos?.produtos || [];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) return; }}>
      <DialogContent 
        ref={dialogRef}
        className="!w-full !h-full mobile-dialog-fix overflow-y-auto !p-0"
        style={{
          position: 'fixed',
          left: 0,
          top: 0,
          width: '100vw',
          height: '100dvh',
          maxWidth: '100vw',
          maxHeight: '100dvh',
          margin: 0,
          borderRadius: 0,
          transform: 'none'
        }}
        data-cupom-fiscal
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
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
            <span>{formatarData(dadosExtraidos?.compra?.data_emissao || dadosExtraidos?.data_emissao)}</span>
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
                {formatarValor(dadosExtraidos?.compra?.valor_total || dadosExtraidos?.valor_total)}
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
            className="w-full active:scale-95 transition-transform"
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
