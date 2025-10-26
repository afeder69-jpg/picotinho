import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { X, CheckCircle2, XCircle, ShoppingCart } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

// Mapeamento de códigos IBGE → sigla UF (sincronizado com edge function)
const UF_MAP: Record<string, string> = {
  '11': 'RO', '12': 'AC', '13': 'AM', '14': 'RR', '15': 'PA',
  '16': 'AP', '17': 'TO', '21': 'MA', '22': 'PI', '23': 'CE',
  '24': 'RN', '25': 'PB', '26': 'PE', '27': 'AL', '28': 'SE',
  '29': 'BA', '31': 'MG', '32': 'ES', '33': 'RJ',
  '35': 'SP', '41': 'PR', '42': 'SC', '43': 'RS', '50': 'MS',
  '51': 'MT', '52': 'GO', '53': 'DF'
};

interface DadosURL {
  chaveAcesso: string;
  uf: string;
  valorTotal: string | null;
  nomeEmitente: string | null;
}

interface InternalWebViewerProps {
  url: string;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  userId: string;
}

/**
 * Extrai dados básicos da URL do QR Code NFe
 */
function extrairDadosURL(url: string): DadosURL | null {
  try {
    // Extrair chave de acesso (44 dígitos)
    let chaveAcesso: string | null = null;
    
    const patternsChave = [
      /chNFe=(\d{44})/i,
      /chave[=/](\d{44})/i,
      /p=(\d{44})/i,
      /\/(\d{44})/,
      /\?(\d{44})/,
      /\b(\d{44})\b/,
    ];
    
    for (const pattern of patternsChave) {
      const match = url.match(pattern);
      if (match && match[1] && /^\d{44}$/.test(match[1])) {
        chaveAcesso = match[1];
        break;
      }
    }
    
    if (!chaveAcesso) {
      console.warn('⚠️ [PARSE] Chave de acesso não encontrada na URL');
      return null;
    }
    
    // Detectar UF pelos primeiros 2 dígitos
    const codigoUF = chaveAcesso.substring(0, 2);
    const uf = UF_MAP[codigoUF] || '??';
    
    // Extrair valor total (vNF)
    let valorTotal: string | null = null;
    
    // Formato 1: Query param ?vNF=123.45
    const matchVNF = url.match(/[?&]vNF=([0-9.]+)/i);
    if (matchVNF) {
      valorTotal = matchVNF[1];
    }
    
    // Formato 2: Pipe-separated ?p=chave|v|a|d|VALOR|hash
    if (!valorTotal) {
      const matchPipe = url.match(/\?p=[^|]+\|[^|]+\|[^|]+\|[^|]*\|([0-9.]+)/);
      if (matchPipe) {
        valorTotal = matchPipe[1];
      }
    }
    
    // Extrair nome do emitente (xNome)
    let nomeEmitente: string | null = null;
    const matchNome = url.match(/[?&]xNome=([^&]+)/i);
    if (matchNome) {
      nomeEmitente = decodeURIComponent(matchNome[1].replace(/\+/g, ' '));
    }
    
    console.log('✅ [PARSE] Dados extraídos:', { chaveAcesso, uf, valorTotal, nomeEmitente });
    
    return { chaveAcesso, uf, valorTotal, nomeEmitente };
    
  } catch (error) {
    console.error('❌ [PARSE] Erro ao extrair dados da URL:', error);
    return null;
  }
}

const InternalWebViewer = ({ 
  url, 
  isOpen, 
  onClose, 
  onConfirm, 
  userId 
}: InternalWebViewerProps) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [dadosNota, setDadosNota] = useState<DadosURL | null>(null);
  
  // Extrair dados da URL quando componente monta ou URL muda
  useEffect(() => {
    if (isOpen && url) {
      const dados = extrairDadosURL(url);
      setDadosNota(dados);
    }
  }, [isOpen, url]);

  if (!isOpen) return null;

  const handleCancel = () => {
    console.log('❌ [INTERNAL VIEWER] Cancelado pelo usuário');
    onClose();
  };

  const handleConfirm = async () => {
    console.log('✅ [INTERNAL VIEWER] Confirmado - processando nota via Serpro...');
    setIsProcessing(true);

    try {
      // Chamar edge function process-nfe-serpro
      const { data, error } = await supabase.functions.invoke('process-nfe-serpro', {
        body: {
          url,
          userId,
        },
      });

      if (error) {
        console.error('❌ [SERPRO] Erro ao processar:', error);
        throw error;
      }

      console.log('✅ [SERPRO] Resposta:', data);

      toast({
        title: data.fromCache 
          ? "💾 Nota processada (cache)" 
          : "✅ Nota processada",
        description: data.message || "Nota fiscal importada com sucesso!",
        duration: 5000,
      });

      // Chamar callback de confirmação (navega para /screenshots)
      onConfirm();

    } catch (error: any) {
      console.error('❌ [ERROR] Falha no processamento:', error);
      
      toast({
        title: "❌ Erro ao processar nota",
        description: error.message || "Não foi possível importar a nota fiscal. Tente novamente.",
        variant: "destructive",
        duration: 6000,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-background">
      {/* Header com botão fechar */}
      <div className="absolute top-0 left-0 right-0 z-10 bg-background/95 backdrop-blur-sm border-b">
        <div className="flex items-center justify-between p-4">
          <h2 className="text-lg font-semibold">Visualizar Nota Fiscal</h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleCancel}
            disabled={isProcessing}
          >
            <X className="w-5 h-5" />
          </Button>
        </div>
      </div>

      {/* Área de visualização com resumo da nota */}
      <div className="pt-16 pb-28 h-full">
        <div className="w-full h-full bg-muted/30 flex flex-col items-center justify-center p-6">
          <ShoppingCart className="w-20 h-20 text-green-600 mb-6" />
          
          <h3 className="text-2xl font-bold mb-6 text-center">
            Você escaneou uma nota de:
          </h3>
          
          {/* Card de resumo da nota */}
          <div className="bg-green-50 border-2 border-green-200 rounded-xl p-6 max-w-md w-full mb-6 shadow-lg">
            {dadosNota ? (
              <>
                {/* Nome do estabelecimento */}
                <div className="mb-4">
                  <p className="text-2xl font-bold text-gray-900 text-center">
                    {dadosNota.nomeEmitente || `Estabelecimento no ${dadosNota.uf}`}
                  </p>
                  {dadosNota.nomeEmitente && (
                    <p className="text-sm text-gray-600 text-center mt-1">
                      {dadosNota.uf}
                    </p>
                  )}
                </div>
                
                {/* Valor total */}
                {dadosNota.valorTotal && (
                  <div className="bg-white rounded-lg p-4 border border-green-300">
                    <p className="text-sm text-gray-600 text-center mb-1">💰 Valor total</p>
                    <p className="text-3xl font-bold text-green-700 text-center">
                      R$ {parseFloat(dadosNota.valorTotal).toFixed(2).replace('.', ',')}
                    </p>
                  </div>
                )}
                
                {/* Chave de acesso (truncada) */}
                <div className="mt-4 text-center">
                  <p className="text-xs text-gray-500 font-mono">
                    {dadosNota.chaveAcesso.substring(0, 8)}...{dadosNota.chaveAcesso.substring(36)}
                  </p>
                </div>
              </>
            ) : (
              <div className="text-center">
                <p className="text-lg font-semibold text-gray-700">
                  Nota Fiscal Eletrônica
                </p>
                <p className="text-sm text-gray-500 mt-2">
                  Processando informações...
                </p>
              </div>
            )}
          </div>
          
          {/* Mensagem de confirmação */}
          <div className="space-y-3 text-center max-w-md">
            <p className="text-lg font-semibold text-gray-800">
              ✅ Confirmar para processar esta nota?
            </p>
            <p className="text-sm text-muted-foreground">
              Os dados serão importados automaticamente via API oficial da Serpro
            </p>
            <p className="text-xs text-muted-foreground opacity-70">
              📡 Conexão segura com a Receita Federal
            </p>
          </div>
        </div>
      </div>

      {/* Botões flutuantes na parte inferior */}
      <div className="fixed bottom-0 left-0 right-0 z-10 bg-background border-t p-4 safe-area-inset-bottom">
        <div className="flex gap-3 max-w-screen-lg mx-auto">
          <Button
            variant="outline"
            size="lg"
            className="flex-1 gap-2 h-14 text-base"
            onClick={handleCancel}
            disabled={isProcessing}
          >
            <XCircle className="w-5 h-5" />
            Cancelar
          </Button>
          <Button
            variant="default"
            size="lg"
            className="flex-1 gap-2 h-14 text-base bg-green-600 hover:bg-green-700"
            onClick={handleConfirm}
            disabled={isProcessing}
          >
            <CheckCircle2 className="w-5 h-5" />
            {isProcessing 
              ? "Processando..." 
              : dadosNota?.valorTotal 
                ? `OK - Confirmar R$ ${parseFloat(dadosNota.valorTotal).toFixed(2).replace('.', ',')}` 
                : "OK - Confirmar"
            }
          </Button>
        </div>
      </div>
    </div>
  );
};

export default InternalWebViewer;
