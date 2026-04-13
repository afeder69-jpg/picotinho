import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { toast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, Info, Loader2 } from "lucide-react";
import { ListaComprasHeader } from "@/components/listaCompras/ListaComprasHeader";
import { ComparacaoTabs } from "@/components/listaCompras/ComparacaoTabs";
import { CardResumoOtimizado } from "@/components/listaCompras/CardResumoOtimizado";
import { GrupoMercado } from "@/components/listaCompras/GrupoMercado";
import { TabelaComparativa } from "@/components/listaCompras/TabelaComparativa";
import { ExportarListaDialog } from "@/components/listaCompras/ExportarListaDialog";
import { EditarListaDialog } from "@/components/listaCompras/EditarListaDialog";
import { ItemProdutoSemPreco } from "@/components/listaCompras/ItemProdutoSemPreco";
import { ItemProdutoLista } from "@/components/listaCompras/ItemProdutoLista";
import { EditarQuantidadeDialog } from "@/components/listaCompras/EditarQuantidadeDialog";
import { ToastAction } from "@/components/ui/toast";

interface ItemLocal {
  id: string;
  produto_nome: string;
  quantidade: number;
  unidade_medida: string;
  comprado: boolean;
  item_livre: boolean;
  produto_id: string | null;
  lista_id: string;
  created_at: string;
}

interface ExclusaoPendente {
  timer: ReturnType<typeof setTimeout>;
  item: ItemLocal;
  indice: number;
}

export default function ListaCompras() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  const [tabAtiva, setTabAtiva] = useState('otimizado');
  const [tabelaAberta, setTabelaAberta] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  // === LAZY LOADING: preços só carregam sob demanda ===
  const [precosCarregados, setPrecosCarregados] = useState(false);
  
  // === ESTADO LOCAL dos itens (para undo/swipe) ===
  const [itensLocais, setItensLocais] = useState<ItemLocal[]>([]);
  const exclusoesPendentesRef = useRef<Map<string, ExclusaoPendente>>(new Map());

  // === EDITAR QUANTIDADE (dialog) ===
  const [itemEditando, setItemEditando] = useState<{ id: string; produto_nome: string; quantidade: number; unidade_medida: string } | null>(null);

  // Buscar lista (leve, sem comparação)
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
  });

  // Buscar comparação de preços (SOMENTE quando o usuário clicar em "Preços")
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
    enabled: precosCarregados && !!lista && !!user,
    staleTime: Infinity,
  });

  // === SINCRONIZAR itensLocais com a query da lista ===
  useEffect(() => {
    if (!lista?.listas_compras_itens) return;
    const pendentes = exclusoesPendentesRef.current;
    const itens = (lista.listas_compras_itens as ItemLocal[]).filter(
      (item) => !pendentes.has(item.id)
    );
    setItensLocais(itens);
  }, [lista?.listas_compras_itens]);

  // === CLEANUP dos timeouts ao desmontar ===
  useEffect(() => {
    const pendentes = exclusoesPendentesRef.current;
    return () => {
      pendentes.forEach((p) => clearTimeout(p.timer));
      pendentes.clear();
    };
  }, []);

  // === INVALIDAR PREÇOS quando a lista muda ===
  const invalidarPrecos = useCallback(() => {
    if (precosCarregados) {
      setPrecosCarregados(false);
      queryClient.removeQueries({ queryKey: ['comparacao-precos', id] });
    }
  }, [precosCarregados, queryClient, id]);

  // === HANDLER: Carregar preços (botão "Preços") ===
  const handleCarregarPrecos = useCallback(() => {
    // Descartar query anterior para garantir dados frescos
    queryClient.removeQueries({ queryKey: ['comparacao-precos', id] });
    setPrecosCarregados(true);
  }, [queryClient, id]);

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
      invalidarPrecos();
    }
  });

  // Mutation para deletar item
  const deletarItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase
        .from('listas_compras_itens')
        .delete()
        .eq('id', itemId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lista-compras', id] });
      invalidarPrecos();
    }
  });

  const handleToggleComprado = useCallback((itemId: string) => {
    // Atualizar localmente de imediato
    setItensLocais(prev => prev.map(item => 
      item.id === itemId ? { ...item, comprado: !item.comprado } : item
    ));
    const item = itensLocais.find(i => i.id === itemId);
    if (item) {
      toggleCompradoMutation.mutate({ itemId, comprado: item.comprado });
    }
  }, [itensLocais, toggleCompradoMutation]);

  const handleQuantidadeChange = useCallback((itemId: string, quantidade: number) => {
    // Atualizar localmente
    setItensLocais(prev => prev.map(item =>
      item.id === itemId ? { ...item, quantidade } : item
    ));
    atualizarQuantidadeMutation.mutate({ itemId, quantidade });
  }, [atualizarQuantidadeMutation]);

  // === REMOVER COM DESFAZER (7 segundos) ===
  const handleRemoverItem = useCallback((itemId: string) => {
    const indice = itensLocais.findIndex(i => i.id === itemId);
    if (indice === -1) return;
    const item = itensLocais[indice];

    // Remover visualmente
    setItensLocais(prev => prev.filter(i => i.id !== itemId));

    // Agendar exclusão definitiva
    const timer = setTimeout(() => {
      exclusoesPendentesRef.current.delete(itemId);
      deletarItemMutation.mutate(itemId);
    }, 7000);

    exclusoesPendentesRef.current.set(itemId, { timer, item, indice });

    toast({
      title: "Item removido",
      description: item.produto_nome,
      duration: 7500,
      action: (
        <ToastAction altText="Desfazer" onClick={() => {
          // Cancelar exclusão
          const pendente = exclusoesPendentesRef.current.get(itemId);
          if (pendente) {
            clearTimeout(pendente.timer);
            exclusoesPendentesRef.current.delete(itemId);
            // Restaurar na posição original
            setItensLocais(prev => {
              const novo = [...prev];
              const posicao = Math.min(pendente.indice, novo.length);
              novo.splice(posicao, 0, pendente.item);
              return novo;
            });
          }
        }}>
          Desfazer
        </ToastAction>
      ),
    });
  }, [itensLocais, deletarItemMutation]);

  // === EDITAR QUANTIDADE via dialog ===
  const handleSalvarQuantidade = useCallback((itemId: string, quantidade: number) => {
    handleQuantidadeChange(itemId, quantidade);
  }, [handleQuantidadeChange]);

  // === HANDLER ao fechar EditarListaDialog ===
  const handleFecharEdicao = useCallback(() => {
    setEditDialogOpen(false);
    queryClient.invalidateQueries({ queryKey: ['lista-compras', id] });
    invalidarPrecos();
  }, [queryClient, id, invalidarPrecos]);

  // ---- LOADING INICIAL (apenas lista, sem esperar preços) ----
  if (loadingLista) {
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

  const totalProdutos = itensLocais.length;

  // === MODO LEVE (sem preços carregados) ===
  if (!precosCarregados || !comparacao) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
        <div className="container max-w-5xl mx-auto p-4 space-y-6 pb-24">
          <ListaComprasHeader
            lista={lista}
            totalProdutos={totalProdutos}
            onVoltar={() => navigate('/listas-compras')}
            onVerTabela={() => {}}
            onExportar={() => {}}
            onEditar={() => setEditDialogOpen(true)}
            onCarregarPrecos={handleCarregarPrecos}
            precosCarregados={false}
            loadingPrecos={loadingComparacao}
          />

          {loadingComparacao && (
            <Alert>
              <Loader2 className="h-4 w-4 animate-spin" />
              <AlertTitle>Buscando preços...</AlertTitle>
              <AlertDescription>
                Comparando preços nos mercados da sua área de atuação.
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            {itensLocais.map(item => (
              <ItemProdutoLista
                key={item.id}
                item={item}
                onToggleComprado={handleToggleComprado}
                onRemover={handleRemoverItem}
                onEditarQuantidade={(it) => setItemEditando(it)}
              />
            ))}
          </div>

          {itensLocais.length === 0 && !loadingLista && (
            <div className="text-center py-12 text-muted-foreground">
              <p>Nenhum item nesta lista.</p>
            </div>
          )}

          <EditarQuantidadeDialog
            open={!!itemEditando}
            onClose={() => setItemEditando(null)}
            item={itemEditando}
            onSalvar={handleSalvarQuantidade}
          />

          <EditarListaDialog
            key={`edit-${lista?.listas_compras_itens?.length}`}
            open={editDialogOpen}
            onClose={handleFecharEdicao}
            lista={lista}
          />
        </div>
      </div>
    );
  }

  // === MODO COMPLETO (preços carregados) ===
  const dadosAtivos = comparacao?.[tabAtiva];
  const temMercadosProximos = comparacao?.supermercados && comparacao.supermercados.length > 0;
  const temPrecosEncontrados = comparacao?.otimizado?.mercados && comparacao.otimizado.mercados.length > 0;

  // CENÁRIO 1: Sem mercados próximos
  if (!temMercadosProximos) {
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
            precosCarregados={true}
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
            key={`edit-${lista?.listas_compras_itens?.length}`}
            open={editDialogOpen}
            onClose={handleFecharEdicao}
            lista={lista}
          />
        </div>
      </div>
    );
  }

  // CENÁRIO 2: Mercados encontrados mas sem preços
  if (temMercadosProximos && !temPrecosEncontrados) {
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
            precosCarregados={true}
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
            key={`edit-${lista?.listas_compras_itens?.length}`}
            open={editDialogOpen}
            onClose={handleFecharEdicao}
            lista={lista}
          />
        </div>
      </div>
    );
  }

  // CENÁRIO 3: Preços encontrados - fluxo completo
  const todosItens = lista.listas_compras_itens || [];
  const produtosSemPrecoRaw = comparacao?.produtosSemPreco || [];
  const itensLivres = todosItens.filter((item: any) => item.item_livre === true);
  const itensLivresIds = new Set(itensLivres.map((i: any) => i.id));
  const produtosSemPreco = produtosSemPrecoRaw.filter((item: any) => !itensLivresIds.has(item.id));

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
          precosCarregados={true}
          loading={loadingLista}
        />

        {produtosSemPreco.length > 0 && produtosSemPreco.length === totalProdutos && (
          <Alert variant="default">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Nenhum produto com preço</AlertTitle>
            <AlertDescription>
              Nenhum dos {produtosSemPreco.length} produtos possui preço cadastrado nos mercados próximos.
              Adicione notas fiscais para habilitar a comparação.
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

            {tabAtiva === 'otimizado' && (
              <>
                <CardResumoOtimizado 
                  modo="otimizado"
                  listaId={id!}
                  tabAtiva={tabAtiva}
                  dados={dadosAtivos}
                />
                
                {dadosAtivos?.mercados?.map((mercado: any) => (
                  <GrupoMercado
                    key={mercado.id}
                    mercado={mercado}
                    produtos={mercado.produtos}
                    onToggleComprado={handleToggleComprado}
                    onQuantidadeChange={handleQuantidadeChange}
                  />
                ))}

                {produtosSemPreco.length > 0 && (
                  <div className="mb-6">
                    <div className="flex items-center justify-between mb-3 p-3 bg-muted/50 rounded-t border border-border">
                      <div>
                        <h3 className="font-semibold flex items-center gap-2 text-muted-foreground">
                          📋 Produtos sem preço nos mercados próximos
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          {produtosSemPreco.length} {produtosSemPreco.length === 1 ? 'produto' : 'produtos'}
                        </p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {produtosSemPreco.map((item: any) => (
                        <ItemProdutoSemPreco
                          key={item.id}
                          item={{
                            id: item.id,
                            produto_nome: item.produto_nome,
                            quantidade: item.quantidade || 1,
                            unidade_medida: item.unidade_medida || 'un',
                            comprado: item.comprado || false,
                            produto_id: item.produto_id || null,
                          }}
                          onToggleComprado={handleToggleComprado}
                          onQuantidadeChange={handleQuantidadeChange}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {itensLivres.length > 0 && (
                  <div className="mb-6">
                    <div className="flex items-center justify-between mb-3 p-3 bg-muted/50 rounded-t border border-border">
                      <div>
                        <h3 className="font-semibold flex items-center gap-2 text-muted-foreground">
                          💬 Lembretes / Itens livres
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          {itensLivres.length} {itensLivres.length === 1 ? 'item' : 'itens'}
                        </p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {itensLivres.map((item: any) => (
                        <ItemProdutoSemPreco
                          key={item.id}
                          item={{
                            id: item.id,
                            produto_nome: item.produto_nome,
                            quantidade: item.quantidade || 1,
                            unidade_medida: item.unidade_medida || 'un',
                            comprado: item.comprado || false,
                            produto_id: null,
                          }}
                          onToggleComprado={handleToggleComprado}
                          onQuantidadeChange={handleQuantidadeChange}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {tabAtiva !== 'otimizado' && dadosAtivos?.produtos && (
              <>
                <CardResumoOtimizado 
                  modo="mercado"
                  listaId={id!}
                  tabAtiva={tabAtiva}
                  dados={dadosAtivos}
                />
                
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

                {produtosSemPreco.length > 0 && (
                  <div className="mb-6 mt-4">
                    <div className="flex items-center justify-between mb-3 p-3 bg-muted/50 rounded-t border border-border">
                      <div>
                        <h3 className="font-semibold flex items-center gap-2 text-muted-foreground">
                          📋 Produtos sem preço nos mercados próximos
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          {produtosSemPreco.length} {produtosSemPreco.length === 1 ? 'produto' : 'produtos'}
                        </p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {produtosSemPreco.map((item: any) => (
                        <ItemProdutoSemPreco
                          key={item.id}
                          item={{
                            id: item.id,
                            produto_nome: item.produto_nome,
                            quantidade: item.quantidade || 1,
                            unidade_medida: item.unidade_medida || 'un',
                            comprado: item.comprado || false,
                            produto_id: item.produto_id || null,
                          }}
                          onToggleComprado={handleToggleComprado}
                          onQuantidadeChange={handleQuantidadeChange}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {itensLivres.length > 0 && (
                  <div className="mb-6 mt-4">
                    <div className="flex items-center justify-between mb-3 p-3 bg-muted/50 rounded-t border border-border">
                      <div>
                        <h3 className="font-semibold flex items-center gap-2 text-muted-foreground">
                          💬 Lembretes / Itens livres
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          {itensLivres.length} {itensLivres.length === 1 ? 'item' : 'itens'}
                        </p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {itensLivres.map((item: any) => (
                        <ItemProdutoSemPreco
                          key={item.id}
                          item={{
                            id: item.id,
                            produto_nome: item.produto_nome,
                            quantidade: item.quantidade || 1,
                            unidade_medida: item.unidade_medida || 'un',
                            comprado: item.comprado || false,
                            produto_id: null,
                          }}
                          onToggleComprado={handleToggleComprado}
                          onQuantidadeChange={handleQuantidadeChange}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </>
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
              key={`edit-${lista?.listas_compras_itens?.length}`}
              open={editDialogOpen}
              onClose={handleFecharEdicao}
              lista={lista}
            />
          </>
        )}
      </div>
    </div>
  );
}
