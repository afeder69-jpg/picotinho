import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { toast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, Info } from "lucide-react";
import { ListaComprasHeader } from "@/components/listaCompras/ListaComprasHeader";
import { ComparacaoTabs } from "@/components/listaCompras/ComparacaoTabs";
import { CardResumoOtimizado } from "@/components/listaCompras/CardResumoOtimizado";
import { GrupoMercado } from "@/components/listaCompras/GrupoMercado";
import { TabelaComparativa } from "@/components/listaCompras/TabelaComparativa";
import { ExportarListaDialog } from "@/components/listaCompras/ExportarListaDialog";
import { EditarListaDialog } from "@/components/listaCompras/EditarListaDialog";

export default function ListaCompras() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  const [tabAtiva, setTabAtiva] = useState('otimizado');
  const [tabelaAberta, setTabelaAberta] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  // Buscar lista
  const { data: lista, isLoading: loadingLista } = useQuery({
    queryKey: ['lista-compras', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('listas_compras')
        .select('*, listas_compras_itens(*)')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
    refetchOnWindowFocus: true,
    refetchInterval: 10000, // Atualizar a cada 10s
  });

  // Buscar comparação de preços
  const { data: comparacao, isLoading: loadingComparacao } = useQuery({
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
    staleTime: 0, // Sempre buscar dados frescos
    refetchOnWindowFocus: true,
    refetchInterval: 15000, // Atualizar a cada 15s
  });

  // Mutation para marcar produto como comprado
  const toggleCompradoMutation = useMutation({
    mutationFn: async ({ itemId, comprado }: { itemId: string; comprado: boolean }) => {
      const { error } = await supabase
        .from('listas_compras_itens')
        .update({ comprado: !comprado })
        .eq('id', itemId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lista-compras', id] });
    }
  });

  // Mutation para atualizar quantidade
  const atualizarQuantidadeMutation = useMutation({
    mutationFn: async ({ itemId, quantidade }: { itemId: string; quantidade: number }) => {
      const { error } = await supabase
        .from('listas_compras_itens')
        .update({ quantidade })
        .eq('id', itemId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lista-compras', id] });
      queryClient.invalidateQueries({ queryKey: ['comparacao-precos', id] });
    }
  });

  const handleToggleComprado = (itemId: string) => {
    const item = lista?.listas_compras_itens.find((i: any) => i.id === itemId);
    if (item) {
      toggleCompradoMutation.mutate({ itemId, comprado: item.comprado });
    }
  };

  const handleQuantidadeChange = (itemId: string, quantidade: number) => {
    atualizarQuantidadeMutation.mutate({ itemId, quantidade });
  };

  if (loadingLista || loadingComparacao) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex items-center justify-center">
        <div className="text-center">
          <div className="h-16 w-16 bg-muted animate-pulse rounded-full mx-auto mb-4" />
          <p className="text-muted-foreground">Carregando lista de compras...</p>
        </div>
      </div>
    );
  }

  if (!lista) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex items-center justify-center">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Lista não encontrada</AlertTitle>
          <AlertDescription>
            A lista de compras que você está procurando não existe.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const dadosAtivos = comparacao?.[tabAtiva];
  const totalProdutos = lista.listas_compras_itens?.length || 0;

  // Verificar se existem mercados próximos E se conseguimos encontrar preços
  const temMercadosProximos = comparacao?.supermercados && comparacao.supermercados.length > 0;
  const temPrecosEncontrados = comparacao?.otimizado?.mercados && comparacao.otimizado.mercados.length > 0;

  // CENÁRIO 1: Sem mercados próximos de fato
  if (comparacao && !temMercadosProximos) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
        <div className="container max-w-5xl mx-auto p-4 space-y-6">
          <ListaComprasHeader
            lista={lista}
            totalProdutos={totalProdutos}
            onVoltar={() => navigate('/listas-compras')}
            onVerTabela={() => {}}
            onExportar={() => {}}
            onEditar={() => setEditDialogOpen(true)}
          />

          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Nenhum mercado próximo</AlertTitle>
            <AlertDescription>
              Não encontramos mercados cadastrados na sua área de atuação. 
              Configure sua localização ou aumente o raio de busca em Configurações.
            </AlertDescription>
          </Alert>

          <EditarListaDialog
            key={`edit-${lista?.listas_compras_itens.length}-${editDialogOpen}`}
            open={editDialogOpen}
            onClose={() => {
              setEditDialogOpen(false);
              queryClient.invalidateQueries({ queryKey: ['lista-compras', id] });
            }}
            lista={lista}
          />
        </div>
      </div>
    );
  }

  // CENÁRIO 2: Mercados encontrados mas sem preços
  if (comparacao && temMercadosProximos && !temPrecosEncontrados) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
        <div className="container max-w-5xl mx-auto p-4 space-y-6">
          <ListaComprasHeader
            lista={lista}
            totalProdutos={totalProdutos}
            onVoltar={() => navigate('/listas-compras')}
            onVerTabela={() => {}}
            onExportar={() => {}}
            onEditar={() => setEditDialogOpen(true)}
          />

          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Mercados encontrados, mas sem preços</AlertTitle>
            <AlertDescription>
              Encontramos {comparacao.supermercados.length} mercado(s) próximo(s), mas não há preços cadastrados para os produtos desta lista.
              Adicione notas fiscais desses mercados para habilitar a comparação de preços.
            </AlertDescription>
          </Alert>

          <EditarListaDialog
            key={`edit-${lista?.listas_compras_itens.length}-${editDialogOpen}`}
            open={editDialogOpen}
            onClose={() => {
              setEditDialogOpen(false);
              queryClient.invalidateQueries({ queryKey: ['lista-compras', id] });
            }}
            lista={lista}
          />
        </div>
      </div>
    );
  }

  // Se houver produtos sem preço
  const produtosSemPreco = comparacao?.produtosSemPreco || [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <div className="container max-w-5xl mx-auto p-4 space-y-6 pb-24">
        <ListaComprasHeader
          lista={lista}
          totalProdutos={totalProdutos}
          onVoltar={() => navigate('/listas-compras')}
          onVerTabela={() => setTabelaAberta(true)}
          onExportar={() => setExportDialogOpen(true)}
          onEditar={() => setEditDialogOpen(true)}
          loading={loadingLista || loadingComparacao}
        />

        {produtosSemPreco.length > 0 && (
          <Alert variant="default">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Alguns produtos sem preço</AlertTitle>
            <AlertDescription>
              {produtosSemPreco.length} produtos não possuem preço cadastrado nos mercados próximos.
              Adicione notas fiscais para melhorar a comparação.
            </AlertDescription>
          </Alert>
        )}

        {comparacao?.otimizado?.mercados && (
          <>
            <ComparacaoTabs
              tabAtiva={tabAtiva}
              onTabChange={setTabAtiva}
              mercados={comparacao.otimizado.mercados}
            />

            <CardResumoOtimizado 
              modo={tabAtiva === 'otimizado' ? 'otimizado' : 'mercado'}
              dados={dadosAtivos}
            />

            {tabAtiva === 'otimizado' && dadosAtivos?.mercados?.map((mercado: any) => (
              <GrupoMercado
                key={mercado.id}
                mercado={mercado}
                produtos={mercado.produtos}
                onToggleComprado={handleToggleComprado}
                onQuantidadeChange={handleQuantidadeChange}
              />
            ))}

            {tabAtiva !== 'otimizado' && dadosAtivos?.produtos && (
              <div className="space-y-2">
                {dadosAtivos.produtos.map((produto: any) => (
                  <div key={produto.id} className="p-3 bg-card rounded border">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{produto.produto_nome}</span>
                      <div className="flex items-center gap-2">
                        <span>R$ {produto.preco_unitario.toFixed(2)}</span>
                        {produto.melhor_preco && <span className="text-green-500">🟢</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <TabelaComparativa
              open={tabelaAberta}
              onClose={() => setTabelaAberta(false)}
              comparacao={comparacao}
            />

            <ExportarListaDialog
              open={exportDialogOpen}
              onClose={() => setExportDialogOpen(false)}
              lista={lista}
              comparacao={comparacao}
              modoAtivo={tabAtiva}
            />

            <EditarListaDialog
              key={`edit-${lista?.listas_compras_itens.length}-${editDialogOpen}`}
              open={editDialogOpen}
              onClose={() => {
                setEditDialogOpen(false);
                queryClient.invalidateQueries({ 
                  queryKey: ['lista-compras', id],
                  refetchType: 'active'
                });
                queryClient.invalidateQueries({ 
                  queryKey: ['comparacao-precos', id],
                  refetchType: 'active'
                });
              }}
              lista={lista}
            />
          </>
        )}
      </div>
    </div>
  );
}