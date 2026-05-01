import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { X, CheckCircle2, XCircle, ShoppingCart } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { extrairChaveNFe, obterTipoDocumentoPorChave } from "@/lib/documentDetection";
import { interpretarErroProcessUrlNota, montarToastErroNota } from "@/lib/notasFiscais";

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
  tipoDocumento: 'NFe' | 'NFCe' | null;
}

interface InternalWebViewerProps {
  url: string;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  userId: string;
}

function extrairDadosURL(url: string): DadosURL | null {
  try {
    const chaveAcesso = extrairChaveNFe(url);

    if (!chaveAcesso) {
      console.warn('⚠️ [PARSE] Chave de acesso não encontrada na URL');
      return null;
    }

    const codigoUF = chaveAcesso.substring(0, 2);
    const uf = UF_MAP[codigoUF] || '??';
    const tipoDocumento = obterTipoDocumentoPorChave(chaveAcesso);

    let valorTotal: string | null = null;
    const matchVNF = url.match(/[?&]vNF=([0-9.]+)/i);
    if (matchVNF) {
      valorTotal = matchVNF[1];
    }

    if (!valorTotal) {
      const matchPipe = url.match(/\?p=[^|]+\|[^|]+\|[^|]+\|[^|]*\|([0-9.]+)/);
      if (matchPipe) {
        valorTotal = matchPipe[1];
      }
    }

    let nomeEmitente: string | null = null;
    const matchNome = url.match(/[?&]xNome=([^&]+)/i);
    if (matchNome) {
      nomeEmitente = decodeURIComponent(matchNome[1].replace(/\+/g, ' '));
    }

    console.log('✅ [PARSE] Dados extraídos:', { chaveAcesso, uf, valorTotal, nomeEmitente, tipoDocumento });
    return { chaveAcesso, uf, valorTotal, nomeEmitente, tipoDocumento };
  } catch (error) {
    console.error('❌ [PARSE] Erro ao extrair dados da URL:', error);
    return null;
  }
}

const InternalWebViewer = ({ url, isOpen, onClose, onConfirm, userId }: InternalWebViewerProps) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [dadosNota, setDadosNota] = useState<DadosURL | null>(null);

  useEffect(() => {
    if (isOpen && url) {
      setDadosNota(extrairDadosURL(url));
    }
  }, [isOpen, url]);

  if (!isOpen) return null;

  const handleCancel = () => {
    console.log('❌ [INTERNAL VIEWER] Cancelado pelo usuário');
    onClose();
  };

  const handleConfirm = async () => {
    console.log('✅ [INTERNAL VIEWER] Confirmado - processando nota via roteamento unificado...');
    setIsProcessing(true);

    try {
      const chaveAcesso = dadosNota?.chaveAcesso || extrairChaveNFe(url);

      if (!chaveAcesso) {
        throw new Error('Não foi possível extrair a chave de acesso da nota');
      }

      const tipoDocumento = obterTipoDocumentoPorChave(chaveAcesso);

      if (!tipoDocumento) {
        throw new Error('Modelo de documento inválido. Use uma chave válida de NF-e (55) ou NFC-e (65)');
      }

      const { data, error } = await supabase.functions.invoke('process-url-nota', {
        body: {
          url,
          userId,
          chaveAcesso,
          tipoDocumento,
        },
      });

      if (error) {
        console.error('❌ [ROTEADOR] Erro ao processar:', error);
        throw error;
      }

      console.log('✅ [ROTEADOR] Resposta:', data);

      toast({
        title: data?.cached ? '💾 Nota processada (cache)' : '✅ Nota processada',
        description: data?.message || 'Nota fiscal importada com sucesso!',
        duration: 5000,
      });

      onConfirm();
    } catch (error: any) {
      console.error('❌ [ERROR] Falha no processamento:', error);
      toast({
        title: '❌ Erro ao processar nota',
        description: error.message || 'Não foi possível importar a nota fiscal. Tente novamente.',
        variant: 'destructive',
        duration: 6000,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-background rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-auto relative">
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b rounded-t-2xl">
          <div className="flex items-center justify-between p-4">
            <h2 className="text-lg font-semibold">Visualizar Nota Fiscal</h2>
            <Button variant="ghost" size="icon" onClick={handleCancel} disabled={isProcessing}>
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>

        <div className="p-6">
          <div className="flex flex-col items-center justify-center">
            <ShoppingCart className="w-20 h-20 text-primary mb-6" />

            <h3 className="text-2xl font-bold mb-6 text-center">Você escaneou uma nota de:</h3>

            <div className="bg-muted border rounded-xl p-6 max-w-md w-full mb-6 shadow-lg">
              {dadosNota ? (
                <>
                  <div className="mb-4">
                    <p className="text-2xl font-bold text-foreground text-center">
                      {dadosNota.nomeEmitente || `Estabelecimento no ${dadosNota.uf}`}
                    </p>
                    <p className="text-sm text-muted-foreground text-center mt-1">
                      {dadosNota.tipoDocumento || 'Documento fiscal'} • {dadosNota.uf}
                    </p>
                  </div>

                  {dadosNota.valorTotal && (
                    <div className="bg-background rounded-lg p-4 border">
                      <p className="text-sm text-muted-foreground text-center mb-1">Valor total</p>
                      <p className="text-3xl font-bold text-primary text-center">
                        R$ {parseFloat(dadosNota.valorTotal).toFixed(2).replace('.', ',')}
                      </p>
                    </div>
                  )}

                  <div className="mt-4 text-center">
                    <p className="text-xs text-muted-foreground font-mono">
                      {dadosNota.chaveAcesso.substring(0, 8)}...{dadosNota.chaveAcesso.substring(36)}
                    </p>
                  </div>
                </>
              ) : (
                <div className="text-center">
                  <p className="text-lg font-semibold text-foreground">Nota Fiscal Eletrônica</p>
                  <p className="text-sm text-muted-foreground mt-2">Processando informações...</p>
                </div>
              )}
            </div>

            <div className="space-y-3 text-center max-w-md">
              <p className="text-lg font-semibold text-foreground">Confirmar para processar esta nota?</p>
              <p className="text-sm text-muted-foreground">
                O Picotinho identifica automaticamente se a chave é NF-e (55) ou NFC-e (65) e usa o fluxo correto.
              </p>
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 z-10 bg-background border-t p-4 rounded-b-2xl">
          <div className="flex gap-3">
            <Button variant="outline" size="lg" className="flex-1 gap-2 h-14 text-base" onClick={handleCancel} disabled={isProcessing}>
              <XCircle className="w-5 h-5" />
              Cancelar
            </Button>
            <Button variant="default" size="lg" className="flex-1 gap-2 h-14 text-base" onClick={handleConfirm} disabled={isProcessing}>
              <CheckCircle2 className="w-5 h-5" />
              {isProcessing
                ? 'Processando...'
                : dadosNota?.valorTotal
                  ? `OK - Confirmar R$ ${parseFloat(dadosNota.valorTotal).toFixed(2).replace('.', ',')}`
                  : 'OK - Confirmar'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InternalWebViewer;
