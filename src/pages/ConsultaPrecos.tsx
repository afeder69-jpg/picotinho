import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import BuscaProduto from '@/components/consultaPrecos/BuscaProduto';
import ResultadoPrecos from '@/components/consultaPrecos/ResultadoPrecos';
import AdicionarListaDialog from '@/components/consultaPrecos/AdicionarListaDialog';

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

interface PrecoMercado {
  valor_unitario: number;
  data_atualizacao: string;
  estabelecimento_nome: string;
  estabelecimento_cnpj: string;
}

const ConsultaPrecos = () => {
  const navigate = useNavigate();
  const [produtoSelecionado, setProdutoSelecionado] = useState<ProdutoMaster | null>(null);
  const [precos, setPrecos] = useState<PrecoMercado[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [dialogLista, setDialogLista] = useState(false);

  const buscarPrecos = useCallback(async (produto: ProdutoMaster) => {
    setProdutoSelecionado(produto);
    setCarregando(true);
    setPrecos([]);

    try {
      const { data, error } = await supabase.functions.invoke('consultar-precos-produto', {
        body: { tipo: 'precos', termo: produto.id },
      });

      if (error) throw error;
      setPrecos(data?.precos || []);
    } catch (err) {
      console.error('Erro ao buscar preços:', err);
    } finally {
      setCarregando(false);
    }
  }, []);

  const handleLimpar = useCallback(() => {
    setProdutoSelecionado(null);
    setPrecos([]);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-subtle flex flex-col pb-32">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b bg-card">
        <Button variant="ghost" size="icon" onClick={() => navigate('/menu')}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-lg font-bold text-foreground">Consulta de Preços</h1>
      </div>

      <div className="flex-1 px-4 py-4 max-w-md mx-auto w-full space-y-4">
        {/* Search section */}
        <BuscaProduto
          onProdutoSelecionado={buscarPrecos}
          onLimpar={handleLimpar}
          produtoSelecionado={produtoSelecionado}
        />

        {/* Results */}
        <ResultadoPrecos
          precos={precos}
          carregando={carregando}
          produtoSelecionado={!!produtoSelecionado}
          onAdicionarLista={() => setDialogLista(true)}
        />
      </div>

      {/* Add to list dialog */}
      <AdicionarListaDialog
        open={dialogLista}
        onClose={() => setDialogLista(false)}
        produto={produtoSelecionado}
      />
    </div>
  );
};

export default ConsultaPrecos;
