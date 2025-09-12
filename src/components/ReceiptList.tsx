import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Eye, Trash2, FileText, X, Bot, Loader2, CheckCircle, Plus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogAction, AlertDialogCancel } from '@/components/ui/alert-dialog';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';

interface Receipt {
  id: string;
  store_name: string | null;
  store_address?: string | null;
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
  debug_texto?: string;
}

// Helper para extrair bairro de um endereço brasileiro em formatos variados
function extractNeighborhood(address?: string | null): string | null {
  if (!address) return null;
  let a = String(address).replace(/\s+/g, ' ').trim();

  // Tenta capturar "BAIRRO: XYZ" ou "BAIRRO XYZ"
  const labelMatch = a.match(/bairro[:\s-]*([A-Za-zÀ-ÿ0-9\s]+?)(?:\s*-\s*|\s*,\s*|$)/i);
  if (labelMatch) return labelMatch[1].trim();

  // Heurística: endereços com " - ": ... - Bairro - Cidade - UF
  const hyphenParts = a.split(' - ').map(p => p.trim()).filter(Boolean);
  if (hyphenParts.length >= 3) {
    const last = hyphenParts[hyphenParts.length - 1];
    if (/^[A-Za-z]{2}$/.test(last)) {
      const maybeNeighborhood = hyphenParts[hyphenParts.length - 3];
      if (
        maybeNeighborhood &&
        !/^\d/.test(maybeNeighborhood) &&
        !/CEP/i.test(maybeNeighborhood) &&
        !/BRASIL/i.test(maybeNeighborhood)
      ) {
        return maybeNeighborhood.replace(/^bairro[:\s-]*/i, '').trim();
      }
    }
  }

  // Remove CEP para não confundir a extração
  a = a.replace(/\b\d{5}-\d{3}\b/, '').trim();

  // Parte após a primeira vírgula (geralmente número + bairro)
  const afterComma = a.includes(',') ? a.split(',').slice(1).join(',').trim() : a;
  // Pega trecho antes do primeiro " - " (antes de CEP/cidade/UF)
  let candidate = afterComma.split(' - ')[0].trim();

  // Se ainda houver múltiplas partes separadas por vírgula, pegar apenas a primeira
  candidate = candidate.split(',')[0]?.trim() || candidate;

  // Limpa pontuações/números iniciais e espaços duplos
  candidate = candidate.replace(/^[,\s-]+/, '');
  candidate = candidate.replace(/^[\d\-/]+\s*/, '').trim();
  candidate = candidate.replace(/\s{2,}/g, ' ').trim();

  if (!candidate || candidate.length < 2) {
    const m = a.match(/,\s*\d*\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s]+?)\s*-\s/);
    if (m) candidate = m[1].trim();
  }

  // Remove prefixo "Bairro" se existir
  candidate = candidate.replace(/^bairro[:\s-]*/i, '').trim();

  return candidate && candidate.length >= 2 ? candidate : null;
}

// Helper para extrair estado de um endereço
function extractState(address?: string | null): string | null {
  if (!address) return null;
  const A = String(address).toUpperCase();

  // Pega o último token de 2 letras (ex.: RJ, SP)
  const matches = A.match(/\b[A-Z]{2}\b/g);
  if (matches && matches.length) {
    return matches[matches.length - 1];
  }

  // Alternativa: UF com hífen no final
  const hyphen = A.match(/\s-\s*([A-Z]{2})\s*$/);
  if (hyphen) return hyphen[1];

  return null;
}

// Normaliza a UF para sigla (RJ, SP, ...), aceita nome completo também
function normalizeUf(value?: string | null): string | null {
  if (!value) return null;
  let s = String(value).trim();
  if (!s) return null;
  // Extrai última sigla de 2 letras se existir
  const m = s.toUpperCase().match(/\b([A-Z]{2})\b(?!.*\b[A-Z]{2}\b)/);
  if (m) return m[1];
  // Remover acentos e termos genéricos
  let noAcc = s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/^ESTADO\s+DO\s+/, '')
    .replace(/^ESTADO\s+DA\s+/, '')
    .replace(/\bBRASIL\b/g, '')
    .trim();
  const map: Record<string, string> = {
    'ACRE': 'AC', 'ALAGOAS': 'AL', 'AMAPA': 'AP', 'AMAZONAS': 'AM', 'BAHIA': 'BA', 'CEARA': 'CE',
    'DISTRITO FEDERAL': 'DF', 'ESPIRITO SANTO': 'ES', 'GOIAS': 'GO', 'MARANHAO': 'MA',
    'MATO GROSSO': 'MT', 'MATO GROSSO DO SUL': 'MS', 'MINAS GERAIS': 'MG', 'PARA': 'PA',
    'PARAIBA': 'PB', 'PARANA': 'PR', 'PERNAMBUCO': 'PE', 'PIAUI': 'PI', 'RIO DE JANEIRO': 'RJ',
    'RIO GRANDE DO NORTE': 'RN', 'RIO GRANDE DO SUL': 'RS', 'RONDONIA': 'RO', 'RORAIMA': 'RR',
    'SANTA CATARINA': 'SC', 'SAO PAULO': 'SP', 'SERGIPE': 'SE', 'TOCANTINS': 'TO',
  };
  return map[noAcc] || null;
}

// Coleta Bairro e UF a partir dos dados estruturados ou endereço
function getNeighborhoodAndUF(receipt: Receipt): { neighborhood: string | null; uf: string | null } {
  // Função melhorada para extrair e limpar bairros
  const extractAndCleanNeighborhood = (source?: string | null): string | null => {
    if (!source) return null;
    let s = String(source).replace(/\s+/g, ' ').trim();

    // Remover prefixos de logradouro
    s = s.replace(/^(RUA|AV|AV\.|AVENIDA|ESTR|ESTR\.|ESTRADA|ROD|ROD\.|RODOVIA|TRAV|TRAV\.|TRAVESSA|ALAMEDA|AL\.|PRAÇA|PRACA|R\.|EST\.)\s+/i, '').trim();

    // Remover "Bairro:" do início
    s = s.replace(/^bairro[:\s-]*/i, '').trim();

    // Para endereços com vírgulas, tentar diferentes estratégias
    if (s.includes(',')) {
      const parts = s.split(',').map(p => p.trim()).filter(Boolean);
      
      // Se tem múltiplas partes, o bairro geralmente está na penúltima ou última
      if (parts.length >= 3) {
        // Formato: "Endereço, Bairro, Cidade - UF"
        s = parts[parts.length - 2];
      } else if (parts.length === 2) {
        // Formato: "Endereço, Bairro - Cidade - UF" ou "Endereço, Bairro"
        s = parts[1];
      }
    }

    // Para endereços com hífens, pegar parte antes do hífen (cidade/UF)
    if (s.includes(' - ')) {
      s = s.split(' - ')[0].trim();
    }

    // Remover números iniciais e símbolos
    s = s.replace(/^[\d\s\-,\/]+/, '').trim();

    // Remover CEP se ainda estiver presente
    s = s.replace(/\b\d{5}-?\d{3}\b/, '').trim();

    // Normalizar espaços
    s = s.replace(/\s{2,}/g, ' ').trim();

    // Verificar se é um bairro válido (pelo menos 2 caracteres, não só números)
    if (s && s.length >= 2 && !/^\d+$/.test(s)) {
      return s;
    }

    return null;
  };

  // Buscar dados do estabelecimento em múltiplas estruturas
  const est = receipt.dados_extraidos?.estabelecimento || 
               receipt.dados_extraidos?.loja || 
               receipt.dados_extraidos?.supermercado ||
               receipt.dados_extraidos?.emitente || {};

  // Buscar endereço em múltiplas fontes
  const endereco = (est as any)?.endereco ||
                   receipt.dados_extraidos?.loja?.endereco ||
                   receipt.dados_extraidos?.endereco ||
                   receipt.processed_data?.estabelecimento?.endereco ||
                   receipt.store_address ||
                   '';

  // Buscar bairro em múltiplas fontes e extrair do endereço
  let neighborhood = 
    (est as any)?.bairro ||
    (est as any)?.bairroLoja ||
    (est as any)?.bairro_estabelecimento ||
    receipt.dados_extraidos?.loja?.bairro ||
    receipt.dados_extraidos?.bairro ||
    receipt.processed_data?.estabelecimento?.bairro;

  // Se não encontrou bairro direto, extrair do endereço
  if (!neighborhood) {
    neighborhood = extractNeighborhood(endereco);
  }

  // Limpar e validar o bairro encontrado
  neighborhood = extractAndCleanNeighborhood(neighborhood);

  // Se ainda não encontrou, tentar mais estratégias no endereço
  if (!neighborhood && endereco) {
    // Tentar extrair novamente com lógicas diferentes
    const enderecoSemCep = endereco.replace(/\b\d{5}-?\d{3}\b/g, '').trim();
    
    // Procurar por padrões como "..., CAMPO GRANDE, ..." 
    const match = enderecoSemCep.match(/,\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s]+?)\s*,/);
    if (match) {
      neighborhood = extractAndCleanNeighborhood(match[1]);
    }
    
    // Se ainda não achou, tentar pegar última parte antes de cidade/UF
    if (!neighborhood) {
      const parts = enderecoSemCep.split(/\s-\s|\s,\s/).filter(Boolean);
      if (parts.length >= 2) {
        neighborhood = extractAndCleanNeighborhood(parts[parts.length - 2]);
      }
    }
  }

  // Buscar UF
  let uf = normalizeUf(
    (est as any)?.uf || 
    (est as any)?.estado || 
    receipt.dados_extraidos?.uf ||
    receipt.processed_data?.estabelecimento?.uf
  );
  
  if (!uf) {
    uf = normalizeUf(extractState(endereco));
  }

  return { 
    neighborhood: neighborhood || 'Centro', // Fallback para Centro se não encontrar
    uf: uf || 'BR' 
  };
}

const ReceiptList = () => {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReceipt, setSelectedReceipt] = useState<Receipt | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [processingReceipts, setProcessingReceipts] = useState<Set<string>>(new Set());
  const [launchingToStock, setLaunchingToStock] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
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
        supabase.from('notas_imagens').select('*, debug_texto').eq('usuario_id', user.id).order('created_at', { ascending: false })
      ]);

      if (receiptsResult.error) throw receiptsResult.error;
      if (notasImagensResult.error) throw notasImagensResult.error;

      const mappedNotasImagens = (notasImagensResult.data || [])
        .map(nota => {
          const dadosExtraidos = nota.dados_extraidos as any;
          const fileName = nota.imagem_path ? nota.imagem_path.split('/').pop() : 'Arquivo sem nome';
          
          // Se estiver processada e tiver dados da IA ou chave de acesso, usar dados estruturados
          if (nota.processada && (dadosExtraidos?.estabelecimento || dadosExtraidos?.chave_acesso)) {
            const estabelecimento = dadosExtraidos.estabelecimento || {};
            const compra = dadosExtraidos.compra || {};
            
            return {
              id: nota.id,
              store_name: estabelecimento.nome || 'Estabelecimento não identificado',
              store_address: estabelecimento.endereco || '',
              store_cnpj: estabelecimento.cnpj || null,
              total_amount: compra.valor_total || dadosExtraidos.valorTotal || null,
              purchase_date: compra.data_emissao || dadosExtraidos.dataCompra || nota.data_criacao,
              purchase_time: null,
              qr_url: dadosExtraidos?.url_original || '',
              status: 'processed',
              created_at: nota.created_at,
              screenshot_url: nota.imagem_url,
              processed_data: nota.dados_extraidos,
              imagem_url: nota.imagem_url,
              dados_extraidos: nota.dados_extraidos,
              processada: nota.processada,
              file_name: fileName,
              file_type: 'PDF',
              debug_texto: (nota as any).debug_texto
            };
          }
          
          // Se não estiver processada ou não tiver dados da IA, usar dados antigos ou nome do arquivo
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
            store_address: '',
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
            file_type: isPdfWithConversion ? 'PDF (convertido)' : (nota.imagem_path?.toLowerCase().includes('.pdf') ? 'PDF' : 'Imagem'),
            debug_texto: (nota as any).debug_texto
          };
        })
        .filter(nota => nota !== null);

      const allReceipts = [
        ...(receiptsResult.data || []),
        ...mappedNotasImagens
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());


      console.log('📜 Lista exibida:', allReceipts.map(r => {
        const { neighborhood, uf } = getNeighborhoodAndUF(r as Receipt);
        return {
          id: r.id,
          nome: (r as any).store_name || (r as any).dados_extraidos?.estabelecimento?.nome || (r as any).dados_extraidos?.loja?.nome || 'N/A',
          bairro: neighborhood || 'N/A',
          uf: uf || 'N/A',
          data: (r as any).purchase_date || (r as any).created_at,
          total: (r as any).total_amount || (r as any).dados_extraidos?.compra?.valor_total || (r as any).dados_extraidos?.valorTotal || null,
        };
      }));

      console.log('🔍 Debug texto check:', allReceipts.map(r => ({ 
        id: r.id, 
        file_name: (r as any).file_name || 'sem nome',
        debug_texto: (r as any).debug_texto ? `PRESENTE (${(r as any).debug_texto.length} chars)` : 'AUSENTE' 
      })));

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
      // Para notas processadas, marcar como não processadas e limpar dados extraídos
      // ao invés de deletar completamente para evitar falsos positivos de duplicata
      const { data: nota } = await supabase
        .from('notas_imagens')
        .select('processada, dados_extraidos')
        .eq('id', id)
        .single();

      if (nota?.processada) {
        // Se estava processada, marcar como não processada e limpar dados extraídos
        await supabase
          .from('notas_imagens')
          .update({ 
            processada: false, 
            dados_extraidos: null 
          })
          .eq('id', id);
        
        console.log('📝 Nota marcada como não processada para evitar falsos positivos de duplicata');
      }

      // Deletar registros das tabelas
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
    // Se for cupom fiscal processado, abrir em nova janela
    if (receipt.dados_extraidos && receipt.processada) {
      openReceiptInNewWindow(receipt);
    } else {
      setSelectedReceipt(receipt);
      setIsDialogOpen(true);
    }
  };

  const openReceiptInNewWindow = (receipt: Receipt) => {
    const cupomHtml = generateCupomHtml(receipt);
    
    if (Capacitor.isNativePlatform()) {
      // No mobile, criar blob e abrir no navegador interno
      const blob = new Blob([cupomHtml], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      
      Browser.open({
        url: url,
        windowName: '_self',
        presentationStyle: 'fullscreen'
      });
    } else {
      // No desktop, manter comportamento atual
      const newWindow = window.open('', '_blank', 'width=400,height=700,scrollbars=yes,resizable=yes');
      if (newWindow) {
        newWindow.document.write(cupomHtml);
        newWindow.document.close();
      }
    }
  };

  const generateCupomHtml = (receipt: Receipt) => {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Cupom Fiscal Digital</title>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { 
              font-family: 'Courier New', monospace; 
              font-size: 12px; 
              margin: 10px; 
              background: white; 
              color: black;
              line-height: 1.4;
            }
            .close-btn {
              position: fixed;
              top: 10px;
              right: 10px;
              background: #f44336;
              color: white;
              border: none;
              border-radius: 50%;
              width: 50px;
              height: 50px;
              font-size: 24px;
              font-weight: bold;
              cursor: pointer;
              box-shadow: 0 4px 12px rgba(0,0,0,0.4);
              z-index: 1000;
              touch-action: manipulation;
            }
            .close-btn:hover, .close-btn:active {
              background: #d32f2f;
              transform: scale(1.1);
            }
            
            @media (max-width: 768px) {
              .close-btn {
                width: 60px;
                height: 60px;
                font-size: 28px;
                top: 20px;
                right: 20px;
              }
            }
            .center { text-align: center; }
            .bold { font-weight: bold; }
            .border-bottom { border-bottom: 1px solid #000; padding-bottom: 8px; margin-bottom: 8px; }
            .border-top { border-top: 1px solid #000; padding-top: 8px; margin-top: 8px; }
            .item { margin: 8px 0; padding: 4px 0; border-bottom: 1px dashed #ccc; }
            .item:last-child { border-bottom: none; }
            .flex { display: flex; justify-content: space-between; }
            .total { font-size: 16px; font-weight: bold; }
          </style>
        </head>
        <body>
          <button class="close-btn" onclick="if(window.Capacitor){window.Capacitor.Plugins.Browser.close()}else{window.close()}" title="Fechar">×</button>
          
          <div class="center border-bottom">
            <h2 class="bold">${receipt.dados_extraidos.estabelecimento?.nome || receipt.dados_extraidos.loja?.nome || 'ESTABELECIMENTO'}</h2>
            <p>CNPJ: ${receipt.dados_extraidos.estabelecimento?.cnpj || receipt.dados_extraidos.loja?.cnpj || 'N/A'}</p>
            <p>${receipt.dados_extraidos.estabelecimento?.endereco || receipt.dados_extraidos.loja?.endereco || 'Endereço não informado'}</p>
          </div>
          
          <div class="center border-bottom">
            <p class="bold">Nota Fiscal de Consumidor Eletrônica</p>
            <div class="flex">
              <span>Número: ${receipt.dados_extraidos.compra?.numero || receipt.dados_extraidos.numeroNota || 'N/A'}</span>
              <span>Série: ${receipt.dados_extraidos.compra?.serie || receipt.dados_extraidos.serie || 'N/A'}</span>
            </div>
            <p>Data: ${receipt.dados_extraidos.compra?.data_emissao || receipt.dados_extraidos.dataCompra || 'N/A'}</p>
          </div>
          
          <div>
            <p class="bold center">ITENS</p>
            ${receipt.dados_extraidos.itens?.map((item: any, index: number) => `
              <div class="item">
                <div>
                  <p class="bold">${item.descricao || item.nome}</p>
                  ${item.codigo ? `<p>Cód: ${item.codigo}</p>` : ''}
                </div>
                <div class="flex">
                  <span>Qtd: ${item.quantidade} ${item.unidade || ''}</span>
                  <span>Unit: ${formatCurrency(item.valor_unitario || item.preco)}</span>
                  <span class="bold">Total: ${formatCurrency(item.valor_total || item.preco)}</span>
                </div>
              </div>
            `).join('') || ''}
          </div>
          
          <div class="border-top">
            <div class="flex total">
              <span>TOTAL:</span>
              <span>${formatCurrency(receipt.dados_extraidos.compra?.valor_total || receipt.dados_extraidos.valorTotal || receipt.total_amount)}</span>
            </div>
            <div class="center">
              <p>Forma de Pagamento: ${receipt.dados_extraidos.compra?.forma_pagamento || receipt.dados_extraidos.formaPagamento || 'N/A'}</p>
            </div>
          </div>
          
          <div class="center border-top">
            <p>Via do Consumidor</p>
          </div>
        </body>
      </html>
    `;
  };

  const processReceiptWithAI = async (receipt: Receipt) => {
    if (processingReceipts.has(receipt.id)) return;

    try {
      setProcessingReceipts(prev => new Set(prev).add(receipt.id));
      toast({ title: "Processando nota fiscal", description: "A IA está analisando os dados da nota..." });

      let processedSuccessfully = false;
      const isPDF = receipt.file_type?.toLowerCase().includes('pdf') || receipt.imagem_url?.toLowerCase().endsWith('.pdf');

      if (isPDF) {
        console.log("📄 PDF detectado - usando process-danfe-pdf");
        console.log("🔍 Dados enviados:", { 
          pdfUrl: receipt.imagem_url, 
          notaImagemId: receipt.id, 
          userId: (await supabase.auth.getUser()).data.user?.id 
        });
        
        // Sempre usar process-danfe-pdf para PDFs
        const pdfResponse = await supabase.functions.invoke('process-danfe-pdf', {
          body: { 
            pdfUrl: receipt.imagem_url, 
            notaImagemId: receipt.id, 
            userId: (await supabase.auth.getUser()).data.user?.id 
          }
        });

        console.log("📋 Resposta da função:", pdfResponse);

        if (pdfResponse.data?.success && pdfResponse.data?.textoCompleto) {
          console.log("✅ PDF processado com sucesso:", pdfResponse.data);
          processedSuccessfully = true;
        } else if (pdfResponse.error) {
          console.error("❌ Erro na função process-danfe-pdf:", pdfResponse.error);
          
          // Se for erro INSUFFICIENT_TEXT, fazer fallback para OCR
          if (pdfResponse.error.message?.includes('INSUFFICIENT_TEXT')) {
            toast({ 
              title: "PDF escaneado detectado", 
              description: "Texto insuficiente - OCR não implementado ainda",
              variant: "destructive" 
            });
            return;
          }
          
          throw new Error(pdfResponse.error.message || "Erro no processamento do PDF");
        }

        if (!pdfResponse.data?.success) {
          throw new Error(pdfResponse.data?.message || "Falha no processamento do PDF");
        }

        console.log("✅ PDF processado com sucesso:", pdfResponse.data);
        toast({ 
          title: "Nota fiscal processada com sucesso!", 
          description: "Use o botão 'Ver Detalhes' para visualizar o cupom fiscal digital." 
        });
        processedSuccessfully = true;

      } else {
        toast({
          title: "Processamento de imagens não implementado",
          description: "Apenas PDFs são suportados no momento",
          variant: "destructive"
        });
        return;
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

  const formatPurchaseDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    
    // Tenta diferentes formatos de data que podem vir da IA
    let date: Date;
    
    // Se contém "T", é formato ISO
    if (dateString.includes('T')) {
      date = new Date(dateString);
    }
    // Se está no formato DD/MM/YYYY HH:MM:SS-03:00
    else if (dateString.includes('/') && dateString.includes(':')) {
      // Extrai a parte da data e hora
      const [datePart, timePart] = dateString.split(' ');
      const [day, month, year] = datePart.split('/');
      const timeWithOffset = timePart.split('-')[0]; // Remove o offset
      date = new Date(`${year}-${month}-${day}T${timeWithOffset}-03:00`);
    }
    // Se está no formato DD/MM/YYYY
    else if (dateString.includes('/')) {
      const [day, month, year] = dateString.split('/');
      date = new Date(`${year}-${month}-${day}`);
    }
    // Fallback para outros formatos
    else {
      date = new Date(dateString);
    }
    
    // Verifica se a data é válida
    if (isNaN(date.getTime())) {
      return dateString; // Retorna a string original se não conseguir converter
    }
    
    return date.toLocaleDateString('pt-BR', { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric' 
    });
  };

  const formatPurchaseDateTime = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    
    // Tenta diferentes formatos de data que podem vir da IA
    let date: Date;
    
    // Se contém "T", é formato ISO
    if (dateString.includes('T')) {
      date = new Date(dateString);
    }
    // Se está no formato DD/MM/YYYY HH:MM:SS-03:00
    else if (dateString.includes('/') && dateString.includes(':')) {
      // Extrai a parte da data e hora
      const [datePart, timePart] = dateString.split(' ');
      const [day, month, year] = datePart.split('/');
      const timeWithOffset = timePart.split('-')[0]; // Remove o offset
      date = new Date(`${year}-${month}-${day}T${timeWithOffset}-03:00`);
    }
    // Se está no formato DD/MM/YYYY
    else if (dateString.includes('/')) {
      const [day, month, year] = dateString.split('/');
      date = new Date(`${year}-${month}-${day}`);
    }
    // Fallback para outros formatos
    else {
      date = new Date(dateString);
    }
    
    // Verifica se a data é válida
    if (isNaN(date.getTime())) {
      return dateString; // Retorna a string original se não conseguir converter
    }
    
    const formattedDate = date.toLocaleDateString('pt-BR', { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric' 
    });
    
    const formattedTime = date.toLocaleTimeString('pt-BR', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
    
    return `${formattedDate} às ${formattedTime}`;
  };

  const formatCurrency = (amount: number | null) =>
    !amount ? 'N/A' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(amount);

  const launchToStock = async (receipt: Receipt) => {
    if (!receipt.dados_extraidos?.itens) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Dados insuficientes para lançar no estoque.",
      });
      return;
    }

    try {
      setLaunchingToStock(receipt.id);

      // Para cada item da nota, adicionar/atualizar no estoque
      for (const item of receipt.dados_extraidos.itens) {
        if (!item.descricao || !item.quantidade) continue;

        // Normalizar nome do produto (mesma lógica da edge function)
        let produtoNome = item.descricao.toString().toUpperCase().trim();
        
        // Aplicar normalizações básicas
        produtoNome = produtoNome
          .replace(/\b(GRAENC|GRANEL)\b/gi, 'GRANEL')
          .replace(/\b(PAO DE FORMA|PAO FORMA)\s*(PULLMAN|PUSPANAT|WICKBOLD|PLUS|VITA)?\s*\d*G?\s*(100\s*NUTRICAO|INTEGRAL|10\s*GRAOS|ORIGINAL)?\b/gi, 'PAO DE FORMA')
          .replace(/\b(ACHOCOLATADO EM PO NESCAU)\s*(380G|3\.0|30KG|\d+G)?\b/gi, 'ACHOCOLATADO EM PO')
          .replace(/\b(FATIADO|MINI\s*LANCHE|170G\s*AMEIXA|380G|450G|480G|500G|180G\s*REQUEIJAO|3\.0|INTEGRAL|10\s*GRAOS|ORIGINAL|\d+G|\d+ML|\d+L|\d+KG)\b/gi, '')
          .replace(/\s+/g, ' ')
          .trim();

        const quantidade = parseFloat(item.quantidade.toString()) || 0;
        const precoUnitario = parseFloat(item.valor_unitario?.toString() || '0') || 0;
        const categoria = item.categoria?.toString().toLowerCase() || 'outros';
        const unidadeMedida = item.unidade?.toString().toLowerCase() || 'unidade';

        // Verificar se produto já existe no estoque
        const { data: estoqueExistente } = await supabase
          .from('estoque_app')
          .select('*')
          .eq('user_id', (await supabase.auth.getUser()).data.user?.id)
          .eq('produto_nome', produtoNome)
          .single();

        if (estoqueExistente) {
          // Atualizar quantidade existente
          const { error: updateError } = await supabase
            .from('estoque_app')
            .update({
              quantidade: estoqueExistente.quantidade + quantidade,
              preco_unitario_ultimo: precoUnitario,
              updated_at: new Date().toISOString()
            })
            .eq('id', estoqueExistente.id);

          if (updateError) throw updateError;
        } else {
          // Criar novo item no estoque
          const { error: insertError } = await supabase
            .from('estoque_app')
            .insert({
              user_id: (await supabase.auth.getUser()).data.user?.id,
              produto_nome: produtoNome,
              categoria: categoria,
              quantidade: quantidade,
              unidade_medida: unidadeMedida,
              preco_unitario_ultimo: precoUnitario
            });

          if (insertError) throw insertError;
        }
      }

      toast({
        title: "✅ Lançado no estoque!",
        description: `${receipt.dados_extraidos.itens.length} itens foram adicionados ao estoque.`,
      });

    } catch (error) {
      console.error('Erro ao lançar no estoque:', error);
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Não foi possível lançar os itens no estoque.",
      });
    } finally {
      setLaunchingToStock(null);
    }
  };

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
      <div className="space-y-[4px]">
        <div className="space-y-[4px]">
          {receipts.map((receipt) => (
            <Card key={receipt.id} className="py-[4px] px-[8px]">
              <div className="flex justify-between items-start">
                <div className="flex-1 space-y-[4px]">
                  {receipt.processada && receipt.dados_extraidos ? (
                    <>
                      {/* Para notas processadas com dados estruturados da IA */}
                      {receipt.dados_extraidos.estabelecimento ? (
                        <>
                           {/* Primeira linha: Nome do mercado */}
                            {/* Nome do mercado, bairro, UF */}
{(() => {
  const { neighborhood: nb, uf } = getNeighborhoodAndUF(receipt);
  const nome = receipt.dados_extraidos.estabelecimento.nome;
  let texto = nome;
  if (nb) texto += `, ${nb}`;
  if (uf) texto += `, ${uf}`;
  return (
                    <h3 className="leading-none" style={{ fontSize: '12px', lineHeight: '14px', fontWeight: 700 }}>
                      {texto}
                    </h3>
  );
})()}
                           
                            {/* Dados da compra em linha compacta */}
                            <div className="flex flex-wrap gap-x-2 gap-y-0" style={{ fontSize: '10px', lineHeight: '14px' }}>
                              <span className="text-muted-foreground">Data: {receipt.purchase_date ? formatPurchaseDateTime(receipt.purchase_date) : 'N/A'}</span>
                              <span className="font-medium text-foreground">
                                Total: {receipt.total_amount ? formatCurrency(receipt.total_amount) : 'N/A'}
                              </span>
                              {receipt.dados_extraidos.itens && (
                                <span className="text-muted-foreground">{receipt.dados_extraidos.itens.length} itens</span>
                              )}
                            </div>
                        </>
                      ) : (
                        /* Fallback para formato antigo */
                        <>
                           {/* Primeira linha: Nome do mercado */}
                            {/* Nome do mercado, bairro, UF */}
{(() => {
  const { neighborhood: nb, uf } = getNeighborhoodAndUF(receipt);
  const nome = receipt.dados_extraidos.loja?.nome || 'Mercado N/A';
  let texto = nome;
  if (nb) texto += `, ${nb}`;
  if (uf) texto += `, ${uf}`;
  return (
                    <h3 className="leading-none" style={{ fontSize: '12px', lineHeight: '14px', fontWeight: 700 }}>
                      {texto}
                    </h3>
  );
})()}
                           
                            {/* Dados da compra em linha compacta */}
                            <div className="flex flex-wrap gap-x-2 gap-y-0" style={{ fontSize: '10px', lineHeight: '14px' }}>
                              <span className="text-muted-foreground">Data: {receipt.dados_extraidos.dataCompra ? formatPurchaseDateTime(receipt.dados_extraidos.dataCompra) : 'N/A'}</span>
                              <span className="font-medium text-foreground">
                                Total: {receipt.dados_extraidos.valorTotal ? formatCurrency(receipt.dados_extraidos.valorTotal) : 'N/A'}
                              </span>
                              {receipt.dados_extraidos.itens && (
                                <span className="text-muted-foreground">{receipt.dados_extraidos.itens.length} itens</span>
                              )}
                            </div>
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      {/* Para notas não processadas */}
                      <div className="space-y-[4px]">
                        {/* Primeira linha: Nome, bairro, UF (fallback com store_address) */}
                         {(() => {
                           const { neighborhood: nb, uf } = getNeighborhoodAndUF(receipt);
                           const nome = receipt.store_name || 'Estabelecimento não identificado';
                           let texto = nome;
                           if (nb) texto += `, ${nb}`;
                           if (uf) texto += `, ${uf}`;
                           return (
                             <h3 className="leading-none" style={{ fontSize: '12px', lineHeight: '14px', fontWeight: 700 }}>{texto}</h3>
                           );
                         })()}
                        
                          {/* Dados da compra em linha compacta */}
                          <div className="flex flex-wrap gap-x-2 gap-y-0" style={{ fontSize: '10px', lineHeight: '14px' }}>
                            <span className="text-muted-foreground">Enviado: {formatDate(receipt.created_at)}</span>
                            <span className="text-orange-600">Processando...</span>
                          </div>
                        
                      </div>
                    </>
                  )}
                </div>
                
                 {/* Botões compactos no lado direito */}
                <div className="flex items-center gap-[4px] flex-shrink-0 ml-2">
                  <Badge 
                    variant={receipt.status === 'processed' || receipt.processada ? 'default' : 'secondary'}
                    className="px-1 py-0" 
                    style={{ fontSize: '10px', height: '16px', lineHeight: '14px' }}
                  >
                    {(receipt.status === 'processed' || receipt.processada) ? 'Processada' : 'Pendente'}
                  </Badge>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => viewReceipt(receipt)} 
                    className="px-[6px] py-0" 
                    style={{ height: '20px', fontSize: '10px' }}
                  >
                    <Eye className="w-3 h-3 mr-1" />
                    Ver Detalhes
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => setDeleteConfirmId(receipt.id)} 
                    className="text-destructive hover:text-destructive px-1 py-0" 
                    style={{ height: '20px' }}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="p-0 m-0 w-full h-full max-w-full rounded-none overflow-hidden text-xs md:relative md:max-w-md md:rounded-lg md:p-6 md:text-base">
          <DialogTitle className="sr-only">
            {selectedReceipt?.dados_extraidos && selectedReceipt?.processada ? 'Cupom Fiscal Digital' : 'Detalhes da Nota Fiscal'}
          </DialogTitle>
          <div className="w-full h-full overflow-y-auto px-2 py-2 md:px-6 md:py-4">
            {selectedReceipt && (
              <>
                {selectedReceipt.dados_extraidos && selectedReceipt.processada ? (
                  <div className="font-mono space-y-4">
                    {/* Cabeçalho do Estabelecimento */}
                    <div className="text-center border-b pb-4">
                      <h2 className="font-bold text-lg uppercase">
                        {selectedReceipt.dados_extraidos.estabelecimento?.nome || selectedReceipt.dados_extraidos.loja?.nome || 'ESTABELECIMENTO'}
                      </h2>
                      <p className="text-xs">
                        CNPJ: {selectedReceipt.dados_extraidos.estabelecimento?.cnpj || selectedReceipt.dados_extraidos.loja?.cnpj || 'N/A'}
                      </p>
                      <p className="text-xs">
                        {selectedReceipt.dados_extraidos.estabelecimento?.endereco || selectedReceipt.dados_extraidos.loja?.endereco || 'Endereço não informado'}
                      </p>
                    </div>

                    {/* Informações da Nota */}
                    <div className="text-center border-b pb-4 space-y-1">
                      <p><strong>Nota Fiscal de Consumidor Eletrônica</strong></p>
                      <div className="flex justify-between text-xs">
                        <span>Número: {selectedReceipt.dados_extraidos.compra?.numero || selectedReceipt.dados_extraidos.numeroNota || 'N/A'}</span>
                        <span>Série: {selectedReceipt.dados_extraidos.compra?.serie || selectedReceipt.dados_extraidos.serie || 'N/A'}</span>
                      </div>
                      <p className="text-xs">
                        Data: {selectedReceipt.dados_extraidos.compra?.data_emissao || selectedReceipt.dados_extraidos.dataCompra || 'N/A'}
                      </p>
                    </div>

                    {/* Itens da Compra */}
                    <div className="space-y-2">
                      <p className="font-bold text-center">ITENS</p>
                      <div className="border-b">
                        {selectedReceipt.dados_extraidos.itens?.map((item: any, index: number) => (
                          <div key={index} className="py-2 border-b border-dashed last:border-0">
                            <div className="flex justify-between items-start">
                              <div className="flex-1 pr-2">
                                <p className="font-medium text-xs uppercase leading-tight">
                                  {item.descricao || item.nome}
                                </p>
                                {item.codigo && (
                                  <p className="text-xs text-gray-600">Cód: {item.codigo}</p>
                                )}
                              </div>
                            </div>
                            <div className="flex justify-between text-xs mt-1">
                              <span>Qtd: {item.quantidade} {item.unidade}</span>
                              <span>Unit: {formatCurrency(item.valor_unitario || item.preco)}</span>
                              <span className="font-bold">Total: {formatCurrency(item.valor_total || item.preco)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Rodapé */}
                    <div className="border-t pt-4 space-y-2">
                      <div className="flex justify-between text-lg font-bold">
                        <span>TOTAL:</span>
                        <span>{formatCurrency(selectedReceipt.dados_extraidos.compra?.valor_total || selectedReceipt.dados_extraidos.valorTotal || selectedReceipt.total_amount)}</span>
                      </div>
                      <div className="text-center text-xs">
                        <p>Forma de Pagamento: {selectedReceipt.dados_extraidos.compra?.forma_pagamento || selectedReceipt.dados_extraidos.formaPagamento || 'N/A'}</p>
                      </div>
                    </div>

                    {/* Linha final */}
                    <div className="text-center text-xs border-t pt-2">
                      <p>Via do Consumidor</p>
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
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
      
      <AlertDialog open={deleteConfirmId !== null} onOpenChange={() => setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              ❗ Você tem certeza que deseja excluir esta nota fiscal?
              <br />
              Essa operação é irreversível e removerá todos os itens associados a esta nota do seu estoque.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteConfirmId) {
                  deleteReceipt(deleteConfirmId);
                  setDeleteConfirmId(null);
                }
              }}
            >
              Confirmar Exclusão
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default ReceiptList;
