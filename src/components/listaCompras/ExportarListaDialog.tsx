import { useState } from "react";
import { FileText, MessageCircle, Send } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { SeletorTelefoneWhatsApp } from "./SeletorTelefoneWhatsApp";

interface ExportarListaDialogProps {
  open: boolean;
  onClose: () => void;
  lista: any;
  comparacao: any;
  modoAtivo: string;
}

export function ExportarListaDialog({ 
  open, 
  onClose, 
  lista, 
  comparacao, 
  modoAtivo 
}: ExportarListaDialogProps) {
  const [gerando, setGerando] = useState(false);
  const [mostrarSeletorTelefone, setMostrarSeletorTelefone] = useState(false);

  const gerarTextoProdutos = (dados: any) => {
    if (!dados?.mercados) return '';
    
    return dados.mercados.map((mercado: any) => {
      const produtos = mercado.produtos.map((p: any) => 
        `☐ ${p.produto_nome} - ${p.quantidade} ${p.unidade_medida} - R$ ${p.preco_unitario.toFixed(2)}`
      ).join('\n');
      
      return `🏪 ${mercado.nome} (R$ ${mercado.total.toFixed(2)}):\n${produtos}`;
    }).join('\n\n');
  };

  const compartilharWhatsApp = () => {
    const dados = comparacao[modoAtivo];
    const modoNome = modoAtivo === 'otimizado' ? 'Otimizada' : dados.nome;
    
    const texto = `
🛒 Lista de Compras: ${lista.titulo}

💰 Opção ${modoNome}
Total: R$ ${dados.total.toFixed(2)}

${dados.economia && dados.economia > 0 ? 
  `🎯 Economia de R$ ${dados.economia.toFixed(2)} (${dados.percentualEconomia.toFixed(1)}%)` : ''}

${gerarTextoProdutos(dados)}
    `.trim();
    
    const url = `https://wa.me/?text=${encodeURIComponent(texto)}`;
    window.open(url, '_blank');
    toast({ title: "Abrindo WhatsApp..." });
    onClose();
  };

  const gerarPDF = async () => {
    setGerando(true);
    try {
      const elemento = document.getElementById('lista-para-exportar');
      if (!elemento) {
        toast({ title: "Erro ao gerar PDF", variant: "destructive" });
        return;
      }

      const canvas = await html2canvas(elemento);
      const imgData = canvas.toDataURL('image/png');
      
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgWidth = 190;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      
      pdf.addImage(imgData, 'PNG', 10, 10, imgWidth, imgHeight);
      pdf.save(`lista-compras-${lista.titulo}.pdf`);
      
      toast({ title: "PDF gerado com sucesso!" });
      onClose();
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      toast({ title: "Erro ao gerar PDF", variant: "destructive" });
    } finally {
      setGerando(false);
    }
  };

  const verificarTelefonesEEnviar = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({ title: "Usuário não autenticado", variant: "destructive" });
        return;
      }

      // Buscar telefones verificados
      const { data: telefones, error } = await supabase
        .from('whatsapp_telefones_autorizados')
        .select('*')
        .eq('usuario_id', user.id)
        .eq('verificado', true)
        .eq('ativo', true);

      if (error) throw error;

      if (!telefones || telefones.length === 0) {
        toast({ 
          title: "❌ Nenhum telefone WhatsApp verificado", 
          description: "Configure e verifique seu número WhatsApp primeiro",
          variant: "destructive" 
        });
        return;
      }

      // Se tem apenas 1 telefone, enviar direto
      if (telefones.length === 1) {
        await enviarPDFComTelefone(telefones[0].id);
        return;
      }

      // Se tem múltiplos, mostrar seletor
      setMostrarSeletorTelefone(true);
    } catch (error: any) {
      console.error('Erro ao verificar telefones:', error);
      toast({ 
        title: "Erro ao verificar telefones", 
        variant: "destructive" 
      });
    }
  };

  const enviarPDFComTelefone = async (telefoneId?: string) => {
    setGerando(true);
    setMostrarSeletorTelefone(false);
    
    try {
      toast({ title: "Gerando PDF..." });
      
      const elemento = document.getElementById('lista-para-exportar');
      if (!elemento) {
        toast({ title: "Erro ao gerar PDF", variant: "destructive" });
        return;
      }

      const canvas = await html2canvas(elemento);
      const imgData = canvas.toDataURL('image/png');
      
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgWidth = 190;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      
      pdf.addImage(imgData, 'PNG', 10, 10, imgWidth, imgHeight);
      
      // Converter PDF para Base64
      const pdfBase64 = pdf.output('datauristring').split(',')[1];
      
      toast({ title: "Enviando para WhatsApp..." });

      const { data, error } = await supabase.functions.invoke('enviar-pdf-whatsapp', {
        body: {
          pdf_base64: pdfBase64,
          filename: `lista-${lista.titulo}.pdf`,
          telefone_id: telefoneId // Incluir telefone específico se foi selecionado
        }
      });

      if (error) throw error;
      
      if (!data?.success) {
        throw new Error(data?.error || 'Erro ao enviar PDF');
      }

      toast({ title: "✅ PDF enviado para seu WhatsApp!" });
      onClose();
    } catch (error: any) {
      console.error('Erro ao enviar PDF:', error);
      toast({ 
        title: error.message || "Erro ao enviar PDF", 
        variant: "destructive" 
      });
    } finally {
      setGerando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>📤 Exportar Lista de Compras</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-3">
          <Button 
            onClick={gerarPDF} 
            className="w-full"
            disabled={gerando}
          >
            <FileText className="mr-2 h-4 w-4" />
            {gerando ? 'Gerando PDF...' : 'Exportar como PDF'}
          </Button>

          <Button 
            onClick={verificarTelefonesEEnviar} 
            className="w-full"
            disabled={gerando}
          >
            <Send className="mr-2 h-4 w-4" />
            {gerando ? 'Enviando...' : 'Enviar PDF via WhatsApp'}
          </Button>
          
          <Button 
            onClick={compartilharWhatsApp} 
            className="w-full"
            variant="outline"
          >
            <MessageCircle className="mr-2 h-4 w-4" />
            Compartilhar Texto no WhatsApp
          </Button>
        </div>

        {/* Elemento oculto para gerar PDF */}
        <div 
          id="lista-para-exportar" 
          className="fixed -left-[9999px] top-0 w-full max-w-4xl bg-white p-8"
          style={{ zIndex: -1 }}
        >
          <div className="p-4">
            <h1 className="text-xl font-bold mb-2">{lista.titulo}</h1>
            <div className="mb-4">
              <p>Total: R$ {comparacao[modoAtivo]?.total.toFixed(2)}</p>
              {comparacao[modoAtivo]?.economia && comparacao[modoAtivo].economia > 0 && (
                <p>Economia: R$ {comparacao[modoAtivo].economia.toFixed(2)}</p>
              )}
            </div>
            {gerarTextoProdutos(comparacao[modoAtivo])}
          </div>
        </div>

        {/* Seletor de telefone WhatsApp */}
        <SeletorTelefoneWhatsApp
          open={mostrarSeletorTelefone}
          onSelect={enviarPDFComTelefone}
          onCancel={() => setMostrarSeletorTelefone(false)}
        />
      </DialogContent>
    </Dialog>
  );
}