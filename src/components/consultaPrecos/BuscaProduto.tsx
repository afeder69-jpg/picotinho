import { useState, useEffect, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, ScanBarcode, Keyboard, Loader2, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { formatarNomeParaExibicao } from '@/lib/utils';

interface ProdutoMaster {
  id: string;
  nome_padrao: string;
  nome_base: string | null;
  marca: string | null;
  categoria: string;
  codigo_barras: string | null;
  imagem_url: string | null;
  qtd_valor: number | null;
  qtd_unidade: string | null;
  unidade_base: string | null;
}

interface BuscaProdutoProps {
  onProdutoSelecionado: (produto: ProdutoMaster) => void;
  onLimpar: () => void;
  produtoSelecionado: ProdutoMaster | null;
}

const BuscaProduto = ({ onProdutoSelecionado, onLimpar, produtoSelecionado }: BuscaProdutoProps) => {
  const [termoBusca, setTermoBusca] = useState('');
  const [sugestoes, setSugestoes] = useState<ProdutoMaster[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [mostrarSugestoes, setMostrarSugestoes] = useState(false);
  const [modoEan, setModoEan] = useState(false);
  const [eanManual, setEanManual] = useState('');
  const [modoScanner, setModoScanner] = useState(false);
  const [buscandoEan, setBuscandoEan] = useState(false);

  // Debounced search
  useEffect(() => {
    if (termoBusca.length < 3) {
      setSugestoes([]);
      return;
    }

    const timer = setTimeout(async () => {
      setCarregando(true);
      try {
        const { data, error } = await supabase.functions.invoke('consultar-precos-produto', {
          body: { tipo: 'nome', termo: termoBusca },
        });

        if (error) throw error;
        setSugestoes(data?.produtos || []);
        setMostrarSugestoes(true);
      } catch (err) {
        console.error('Erro na busca:', err);
      } finally {
        setCarregando(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [termoBusca]);

  const buscarPorEan = useCallback(async (ean: string) => {
    if (!ean || ean.length < 8) {
      toast.error('Código EAN inválido');
      return;
    }

    setCarregando(true);
    try {
      const { data, error } = await supabase.functions.invoke('consultar-precos-produto', {
        body: { tipo: 'ean', termo: ean },
      });

      if (error) throw error;

      const produtos = data?.produtos || [];
      if (produtos.length === 0) {
        toast.error('Nenhum produto encontrado com este código');
        return;
      }

      if (produtos.length === 1) {
        onProdutoSelecionado(produtos[0]);
        setModoEan(false);
        setEanManual('');
      } else {
        setSugestoes(produtos);
        setMostrarSugestoes(true);
      }
    } catch (err) {
      console.error('Erro na busca por EAN:', err);
      toast.error('Erro ao buscar produto');
    } finally {
      setCarregando(false);
      setBuscandoEan(false);
    }
  }, [onProdutoSelecionado]);

  const handleScannerResult = useCallback((ean: string) => {
    setModoScanner(false);
    setBuscandoEan(true);
    buscarPorEan(ean);
  }, [buscarPorEan]);

  if (produtoSelecionado) {
    return (
      <div className="bg-card border rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {produtoSelecionado.imagem_url && (
              <img
                src={produtoSelecionado.imagem_url}
                alt={produtoSelecionado.nome_padrao}
                className="w-12 h-12 object-contain rounded"
              />
            )}
            <div className="min-w-0">
              <p className="font-semibold text-foreground truncate">
                {formatarNomeParaExibicao(produtoSelecionado.nome_padrao)}
              </p>
              <p className="text-sm text-muted-foreground">
                {produtoSelecionado.marca && `${produtoSelecionado.marca} · `}
                {produtoSelecionado.qtd_valor && produtoSelecionado.qtd_unidade
                  ? `${produtoSelecionado.qtd_valor}${produtoSelecionado.qtd_unidade}`
                  : produtoSelecionado.categoria}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onLimpar}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>
    );
  }

  if (modoScanner) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-foreground">Escanear Código de Barras</h3>
          <Button variant="ghost" size="sm" onClick={() => setModoScanner(false)}>
            <X className="w-4 h-4 mr-1" /> Fechar
          </Button>
        </div>
        <EanScannerInline onResult={handleScannerResult} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Search by name */}
      {!modoEan && (
        <div className="relative">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar produto por nome..."
              value={termoBusca}
              onChange={(e) => setTermoBusca(e.target.value)}
              className="pl-10"
              autoFocus
            />
            {carregando && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
            )}
          </div>

          {/* Suggestions dropdown */}
          {mostrarSugestoes && sugestoes.length > 0 && (
            <div className="absolute z-50 w-full mt-1 bg-card border rounded-lg shadow-lg max-h-64 overflow-y-auto">
              {sugestoes.map((p) => (
                <button
                  key={p.id}
                  className="w-full text-left px-4 py-3 hover:bg-muted/50 border-b last:border-b-0 transition-colors"
                  onClick={() => {
                    onProdutoSelecionado(p);
                    setTermoBusca('');
                    setMostrarSugestoes(false);
                    setSugestoes([]);
                  }}
                >
                  <p className="font-medium text-sm text-foreground">
                    {formatarNomeParaExibicao(p.nome_padrao)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {p.marca && `${p.marca} · `}{p.categoria}
                    {p.codigo_barras && ` · EAN: ${p.codigo_barras}`}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Manual EAN input */}
      {modoEan && (
        <div className="flex gap-2">
          <Input
            placeholder="Digite o código EAN..."
            value={eanManual}
            onChange={(e) => setEanManual(e.target.value.replace(/\D/g, ''))}
            className="flex-1"
            inputMode="numeric"
            autoFocus
          />
          <Button onClick={() => buscarPorEan(eanManual)} disabled={carregando}>
            {carregando ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Buscar'}
          </Button>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={() => setModoScanner(true)}
        >
          <ScanBarcode className="w-4 h-4 mr-2" />
          Escanear EAN
        </Button>
        <Button
          variant={modoEan ? 'default' : 'outline'}
          size="sm"
          className="flex-1"
          onClick={() => {
            setModoEan(!modoEan);
            if (modoEan) setEanManual('');
          }}
        >
          <Keyboard className="w-4 h-4 mr-2" />
          Digitar EAN
        </Button>
      </div>
    </div>
  );
};

// Inline barcode scanner using html5-qrcode
function EanScannerInline({ onResult }: { onResult: (ean: string) => void }) {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let scanner: any = null;
    let stopped = false;

    const stopScanner = async () => {
      if (stopped || !scanner) return;
      stopped = true;
      try {
        await scanner.stop();
      } catch {
        // already stopped or not running
      }
    };

    const startScanner = async () => {
      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode');
        scanner = new Html5Qrcode('ean-scanner-container', {
          formatsToSupport: [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.CODE_128,
          ],
          verbose: false,
        });

        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 280, height: 100 } },
          async (decodedText: string) => {
            // CRITICAL: wait for scanner to fully stop and release DOM
            // before triggering state change that unmounts this component
            await stopScanner();
            onResult(decodedText);
          },
          () => {}
        );
      } catch (err: any) {
        console.error('Scanner error:', err);
        setError('Não foi possível acessar a câmera');
      }
    };

    startScanner();

    return () => {
      stopScanner();
    };
  }, [onResult]);

  if (error) {
    return (
      <div className="p-4 bg-destructive/10 rounded-lg text-center">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  return (
    <div
      id="ean-scanner-container"
      className="w-full rounded-lg overflow-hidden"
      style={{ minHeight: 200 }}
    />
  );
}

export default BuscaProduto;
