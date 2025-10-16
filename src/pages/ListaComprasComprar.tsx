import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ShoppingCart } from "lucide-react";
import { ItemProdutoInterativo } from "@/components/listaCompras/ItemProdutoInterativo";
import { ResumoComprasAtivas } from "@/components/listaCompras/ResumoComprasAtivas";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ProdutoMarcado {
  id: string;
  produto_nome: string;
  quantidade: number;
  unidade_medida: string;
  preco_unitario: number;
  preco_total: number;
  marcado: boolean;
  mercado?: string;
}

export default function ListaComprasComprar() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const modoParam = searchParams.get('modo') || 'otimizado';
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const [produtos, setProdutos] = useState<ProdutoMarcado[]>([]);
  const [dialogAberto, setDialogAberto] = useState(false);

  // Buscar lista
  const { data: lista } = useQuery({
    queryKey: ['lista-compras', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('listas_compras')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Buscar comparação de preços
  const { data: comparacao } = useQuery({
    queryKey: ['comparacao-precos', id],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('comparar-precos-lista', {
        body: { 
          userId: user?.id,
          listaId: id
        }
      });
      if (error) throw error;
      return data;
    },
    enabled: !!lista && !!user,
  });

  // Extrair produtos do modo escolhido
  const produtosDaOpcao = useMemo(() => {
    if (!comparacao || !modoParam) return [];
    
    if (modoParam === 'otimizado') {
      // Juntar todos os produtos de todos os mercados do modo otimizado
      return comparacao.otimizado.mercados.flatMap((m: any) => 
        m.produtos.map((p: any) => ({
          ...p,
          mercado: m.nome,
          preco_total: p.quantidade * p.preco_unitario
        }))
      );
    } else {
      // Produtos de um mercado específico
      const dados = comparacao[modoParam];
      return dados?.produtos?.map((p: any) => ({
        ...p,
        mercado: dados.nome,
        preco_total: p.quantidade * p.preco_unitario
      })) || [];
    }
  }, [comparacao, modoParam]);

  // Total da lista completa
  const totalLista = useMemo(() => {
    return produtosDaOpcao.reduce((acc: number, p: any) => acc + p.preco_total, 0);
  }, [produtosDaOpcao]);

  // Total marcado
  const totalMarcado = useMemo(() => {
    return produtos
      .filter(p => p.marcado)
      .reduce((acc, p) => acc + p.preco_total, 0);
  }, [produtos]);

  // Quantidade marcada
  const quantidadeMarcada = produtos.filter(p => p.marcado).length;

  // Inicializar estado com produtos desmarcados
  useEffect(() => {
    if (produtosDaOpcao.length > 0) {
      const storageKey = `lista-comprar-${id}-${modoParam}`;
      const salvo = localStorage.getItem(storageKey);
      
      if (salvo) {
        try {
          setProdutos(JSON.parse(salvo));
        } catch {
          // Se falhar ao parsear, inicializar do zero
          setProdutos(produtosDaOpcao.map((p: any) => ({ ...p, marcado: false })));
        }
      } else {
        setProdutos(produtosDaOpcao.map((p: any) => ({ ...p, marcado: false })));
      }
    }
  }, [produtosDaOpcao, id, modoParam]);

  // Salvar no localStorage a cada mudança
  useEffect(() => {
    if (produtos.length > 0) {
      const storageKey = `lista-comprar-${id}-${modoParam}`;
      localStorage.setItem(storageKey, JSON.stringify(produtos));
    }
  }, [produtos, id, modoParam]);

  const toggleProduto = (produtoId: string) => {
    setProdutos(prev => prev.map(p => 
      p.id === produtoId 
        ? { ...p, marcado: !p.marcado }
        : p
    ));
  };

  const finalizarCompras = () => {
    setDialogAberto(true);
  };

  const confirmarFinalizacao = () => {
    const storageKey = `lista-comprar-${id}-${modoParam}`;
    localStorage.removeItem(storageKey);
    
    toast({
      title: "Compras finalizadas! 🎉",
      description: `Você gastou R$ ${totalMarcado.toFixed(2)}`,
    });
    
    navigate('/listas-compras');
  };

  const mercadosUnicos = useMemo(() => {
    const mercados = new Set(produtos.map(p => p.mercado).filter(Boolean));
    return Array.from(mercados);
  }, [produtos]);

  if (!lista || !comparacao) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="h-16 w-16 bg-muted animate-pulse rounded-full mx-auto mb-4" />
          <p className="text-muted-foreground">Carregando lista...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      {/* Header fixo */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b">
        <div className="container max-w-3xl mx-auto p-4">
          <div className="flex items-center gap-3 mb-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(`/lista-compras/${id}`)}
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1">
              <h1 className="text-xl font-bold text-foreground">{lista.titulo}</h1>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <ShoppingCart className="h-4 w-4" />
                {mercadosUnicos.length > 0 && (
                  <span>{mercadosUnicos.join(' + ')}</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Resumo sticky */}
      <div className="sticky top-[73px] z-10">
        <ResumoComprasAtivas
          totalLista={totalLista}
          totalMarcado={totalMarcado}
          quantidadeMarcada={quantidadeMarcada}
          totalProdutos={produtos.length}
        />
      </div>

      {/* Lista de produtos */}
      <div className="container max-w-3xl mx-auto p-4 space-y-3 pb-32">
        {modoParam === 'otimizado' ? (
          // Agrupar por mercado no modo otimizado
          mercadosUnicos.map(mercado => {
            const produtosMercado = produtos.filter(p => p.mercado === mercado);
            return (
              <div key={mercado} className="space-y-2">
                <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 rounded-lg">
                  <ShoppingCart className="h-4 w-4 text-primary" />
                  <span className="font-semibold text-sm">{mercado}</span>
                </div>
                {produtosMercado.map(produto => (
                  <ItemProdutoInterativo
                    key={produto.id}
                    produto={produto}
                    onToggle={toggleProduto}
                  />
                ))}
              </div>
            );
          })
        ) : (
          // Lista simples no modo mercado específico
          produtos.map(produto => (
            <ItemProdutoInterativo
              key={produto.id}
              produto={produto}
              onToggle={toggleProduto}
            />
          ))
        )}
      </div>

      {/* Footer fixo */}
      <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-sm border-t p-4 pb-6">
        <div className="container max-w-3xl mx-auto">
          <Button
            size="lg"
            className="w-full"
            onClick={finalizarCompras}
            disabled={quantidadeMarcada === 0}
          >
            Finalizar Compras
          </Button>
        </div>
      </div>

      {/* Dialog de confirmação */}
      <AlertDialog open={dialogAberto} onOpenChange={setDialogAberto}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Finalizar compras?</AlertDialogTitle>
            <AlertDialogDescription>
              Você marcou {quantidadeMarcada} de {produtos.length} produtos.
              <br />
              <span className="font-semibold text-lg text-foreground block mt-2">
                Total gasto: R$ {totalMarcado.toFixed(2)}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuar comprando</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarFinalizacao}>
              Finalizar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
