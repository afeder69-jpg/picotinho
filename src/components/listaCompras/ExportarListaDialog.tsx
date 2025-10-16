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

  const enviarListaWhatsApp = async () => {
    setGerando(true);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({ title: "Usuário não autenticado", variant: "destructive" });
        return;
      }

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
        setGerando(false);
        return;
      }

      if (telefones.length === 1) {
        await enviarListaComTelefone(telefones[0].id);
        return;
      }

      setMostrarSeletorTelefone(true);
      setGerando(false);
    } catch (error: any) {
      console.error('Erro ao verificar telefones:', error);
      toast({ 
        title: "Erro ao verificar telefones", 
        variant: "destructive" 
      });
      setGerando(false);
    }
  };

  const enviarListaComTelefone = async (telefoneId?: string) => {
    setGerando(true);
    setMostrarSeletorTelefone(false);
    
    try {
      toast({ title: "Enviando lista para WhatsApp..." });
      
      const dados = comparacao[modoAtivo];
      
      const { data, error } = await supabase.functions.invoke('enviar-lista-whatsapp', {
        body: {
          lista_titulo: lista.titulo,
          modo_ativo: modoAtivo,
          dados_comparacao: dados,
          telefone_id: telefoneId
        }
      });

      if (error) throw error;
      
      if (!data?.success) {
        throw new Error(data?.error || 'Erro ao enviar lista');
      }

      toast({ title: "✅ Lista enviada para seu WhatsApp!" });
      onClose();
    } catch (error: any) {
      console.error('Erro ao enviar lista:', error);
      toast({ 
        title: error.message || "Erro ao enviar lista", 
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
            onClick={enviarListaWhatsApp} 
            className="w-full"
            disabled={gerando}
          >
            <Send className="mr-2 h-4 w-4" />
            {gerando ? 'Enviando...' : 'Enviar Lista via WhatsApp'}
          </Button>
          
          <Button 
            onClick={compartilharWhatsApp} 
            className="w-full"
            variant="outline"
          >
            <MessageCircle className="mr-2 h-4 w-4" />
            Compartilhar Texto (App WhatsApp)
          </Button>
        </div>

        {/* Elemento oculto para gerar PDF */}
        <div 
          id="lista-para-exportar" 
          className="fixed -left-[9999px] top-0 bg-white"
          style={{ 
            zIndex: -1,
            width: '210mm',
            minHeight: '297mm',
            padding: '20mm',
            fontFamily: 'Arial, sans-serif'
          }}
        >
          {/* CABEÇALHO */}
          <div style={{ borderBottom: '3px solid #2563eb', paddingBottom: '12px', marginBottom: '20px' }}>
            <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#1e40af', marginBottom: '8px' }}>
              🛒 {lista.titulo}
            </h1>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: '#6b7280' }}>
              <span>📋 Modo: {modoAtivo === 'otimizado' ? 'Otimizado' : comparacao[modoAtivo]?.nome}</span>
              <span>📅 {new Date().toLocaleDateString('pt-BR')}</span>
            </div>
          </div>

          {/* RESUMO DESTACADO */}
          <div style={{ 
            backgroundColor: '#dbeafe', 
            border: '2px solid #2563eb',
            borderRadius: '8px',
            padding: '16px',
            marginBottom: '24px'
          }}>
            <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#1e40af', marginBottom: '8px' }}>
              💰 RESUMO
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <span style={{ fontSize: '14px', color: '#6b7280' }}>Total Geral:</span>
                <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#1e40af' }}>
                  R$ {comparacao[modoAtivo]?.total.toFixed(2)}
                </div>
              </div>
              {comparacao[modoAtivo]?.economia && comparacao[modoAtivo].economia > 0 && (
                <div>
                  <span style={{ fontSize: '14px', color: '#6b7280' }}>Economia:</span>
                  <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#16a34a' }}>
                    🎯 R$ {comparacao[modoAtivo].economia.toFixed(2)}
                  </div>
                  <div style={{ fontSize: '12px', color: '#16a34a' }}>
                    ({comparacao[modoAtivo].percentualEconomia.toFixed(1)}% de desconto)
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* PRODUTOS POR MERCADO */}
          <div style={{ marginBottom: '20px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: '#1f2937', marginBottom: '16px' }}>
              📦 PRODUTOS
            </h2>
            
            {comparacao[modoAtivo]?.mercados?.map((mercado: any, idx: number) => (
              <div 
                key={idx}
                style={{ 
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  padding: '16px',
                  marginBottom: '16px',
                  backgroundColor: '#f9fafb'
                }}
              >
                {/* Cabeçalho do Mercado */}
                <div style={{ 
                  borderBottom: '2px solid #e5e7eb',
                  paddingBottom: '8px',
                  marginBottom: '12px'
                }}>
                  <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#1f2937', marginBottom: '4px' }}>
                    🏪 {mercado.nome}
                  </div>
                  <div style={{ fontSize: '14px', color: '#6b7280' }}>
                    Subtotal: <span style={{ fontWeight: 'bold', color: '#2563eb' }}>
                      R$ {mercado.total.toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Lista de Produtos do Mercado */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {mercado.produtos.map((produto: any, pIdx: number) => (
                    <div 
                      key={pIdx}
                      style={{ 
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '8px',
                        backgroundColor: 'white',
                        borderRadius: '4px',
                        fontSize: '13px'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                        <span style={{ fontSize: '16px' }}>☐</span>
                        <span style={{ fontWeight: '500', color: '#374151' }}>
                          {produto.produto_nome}
                        </span>
                      </div>
                      <div style={{ 
                        display: 'flex', 
                        gap: '16px', 
                        alignItems: 'center',
                        color: '#6b7280'
                      }}>
                        <span>{produto.quantidade} {produto.unidade_medida}</span>
                        <span>×</span>
                        <span>R$ {produto.preco_unitario.toFixed(2)}</span>
                        <span>=</span>
                        <span style={{ fontWeight: 'bold', color: '#2563eb', minWidth: '80px', textAlign: 'right' }}>
                          R$ {(produto.quantidade * produto.preco_unitario).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* RODAPÉ */}
          <div style={{ 
            borderTop: '1px solid #d1d5db',
            paddingTop: '12px',
            marginTop: '24px',
            fontSize: '12px',
            color: '#9ca3af',
            textAlign: 'center'
          }}>
            Gerado por Picotinho em {new Date().toLocaleString('pt-BR')}
          </div>
        </div>

        {/* Seletor de telefone WhatsApp */}
        <SeletorTelefoneWhatsApp
          open={mostrarSeletorTelefone}
          onSelect={enviarListaComTelefone}
          onCancel={() => setMostrarSeletorTelefone(false)}
        />
      </DialogContent>
    </Dialog>
  );
}