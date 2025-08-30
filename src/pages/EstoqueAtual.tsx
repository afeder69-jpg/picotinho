import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Package, Calendar, ArrowLeft, Home, Trash2, ArrowUp, ArrowDown, Minus, Edit3, Plus } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import PicotinhoLogo from '@/components/PicotinhoLogo';

interface EstoqueItem {
  id: string;
  produto_nome: string;
  categoria: string;
  unidade_medida: string;
  quantidade: number;
  preco_unitario_ultimo: number | null;
  updated_at: string;
}

const EstoqueAtual = () => {
  const [estoque, setEstoque] = useState<EstoqueItem[]>([]);
  const [precosAtuais, setPrecosAtuais] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState<string>('');
  const [modoEdicao, setModoEdicao] = useState(false);
  const [itemEditando, setItemEditando] = useState<EstoqueItem | null>(null);
  const [novaQuantidade, setNovaQuantidade] = useState<number>(0);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    loadEstoque();
    loadPrecosAtuais();
  }, []);

  const loadPrecosAtuais = async () => {
    try {
      const { data, error } = await supabase
        .from('precos_atuais')
        .select('*')
        .order('produto_nome', { ascending: true });

      if (error) throw error;
      setPrecosAtuais(data || []);
    } catch (error) {
      console.error('Erro ao carregar preços atuais:', error);
    }
  };

  // Função para encontrar preço atual de um produto
  const encontrarPrecoAtual = (nomeProduto: string) => {
    return precosAtuais.find(preco => 
      preco.produto_nome && 
      (preco.produto_nome.toLowerCase().includes(nomeProduto.toLowerCase()) ||
       nomeProduto.toLowerCase().includes(preco.produto_nome.toLowerCase()))
    );
  };

  const loadEstoque = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('estoque_app')
        .select('*')
        .eq('user_id', user.id)
        .order('produto_nome', { ascending: true });

      if (error) throw error;

      setEstoque(data || []);
      
      // Encontrar a última atualização
      if (data && data.length > 0) {
        const ultimaData = data.reduce((latest, item) => {
          const itemDate = new Date(item.updated_at);
          return itemDate > new Date(latest) ? item.updated_at : latest;
        }, data[0].updated_at);
        setUltimaAtualizacao(ultimaData);
      }
    } catch (error) {
      console.error('Erro ao carregar estoque:', error);
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Não foi possível carregar o estoque.",
      });
    } finally {
      setLoading(false);
    }
  };

  const limparEstoque = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        toast({
          variant: "destructive",
          title: "Erro",
          description: "Usuário não autenticado.",
        });
        return;
      }

      const { error } = await supabase.rpc('limpar_estoque_usuario', {
        usuario_uuid: user.id
      });

      if (error) throw error;

      toast({
        title: "Sucesso",
        description: "Estoque limpo completamente.",
      });

      loadEstoque();
    } catch (error) {
      console.error('Erro ao limpar estoque:', error);
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Não foi possível limpar o estoque.",
      });
    }
  };

  const abrirModalEdicao = (item: EstoqueItem) => {
    setItemEditando(item);
    setNovaQuantidade(item.quantidade);
  };

  const fecharModalEdicao = () => {
    setItemEditando(null);
    setNovaQuantidade(0);
  };

  const ajustarQuantidade = (operacao: 'aumentar' | 'diminuir' | 'zerar') => {
    if (!itemEditando) return;

    let novoValor = novaQuantidade;
    
    if (operacao === 'zerar') {
      novoValor = 0;
    } else {
      const incremento = itemEditando.unidade_medida.toLowerCase().includes('kg') ? 0.01 : 1;
      
      if (operacao === 'aumentar') {
        novoValor += incremento;
      } else if (operacao === 'diminuir') {
        novoValor = Math.max(0, novoValor - incremento);
      }
    }
    
    setNovaQuantidade(Math.round(novoValor * 100) / 100);
  };

  const salvarAjuste = async () => {
    if (!itemEditando) return;

    try {
      const { error } = await supabase
        .from('estoque_app')
        .update({ 
          quantidade: novaQuantidade,
          updated_at: new Date().toISOString()
        })
        .eq('id', itemEditando.id);

      if (error) throw error;

      toast({
        title: "Sucesso",
        description: `Quantidade atualizada para ${novaQuantidade} ${itemEditando.unidade_medida}`,
      });

      fecharModalEdicao();
      loadEstoque();
    } catch (error) {
      console.error('Erro ao atualizar estoque:', error);
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Não foi possível atualizar a quantidade.",
      });
    }
  };


  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('pt-BR');
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  // Função para normalizar valores para 2 casas decimais
  const normalizeValue = (value: number) => {
    return Math.round(value * 100) / 100;
  };

  const getCategoriaColor = (categoria: string) => {
    const colors: { [key: string]: string } = {
      'laticínios': 'bg-[#FFEB3B] text-black font-bold text-lg px-4 py-2 rounded-lg',
      'outros': 'bg-[#9E9E9E] text-white font-bold text-lg px-4 py-2 rounded-lg',
      'hortifruti': 'bg-[#4CAF50] text-white font-bold text-lg px-4 py-2 rounded-lg',
      'bebidas': 'bg-[#2196F3] text-white font-bold text-lg px-4 py-2 rounded-lg',
      'mercearia': 'bg-[#FF5722] text-white font-bold text-lg px-4 py-2 rounded-lg',
      'limpeza': 'bg-[#00BCD4] text-white font-bold text-lg px-4 py-2 rounded-lg',
      'padaria': 'bg-[#FF9800] text-white font-bold text-lg px-4 py-2 rounded-lg',
      'carnes': 'bg-[#D32F2F] text-white font-bold text-lg px-4 py-2 rounded-lg',
      'higiene': 'bg-[#8BC34A] text-white font-bold text-lg px-4 py-2 rounded-lg',
      // Categorias existentes que não foram especificadas
      'frutas': 'bg-[#4CAF50] text-white font-bold text-lg px-4 py-2 rounded-lg',
      'verduras': 'bg-[#4CAF50] text-white font-bold text-lg px-4 py-2 rounded-lg',
      'legumes': 'bg-[#4CAF50] text-white font-bold text-lg px-4 py-2 rounded-lg',
      'cereais': 'bg-[#FF5722] text-white font-bold text-lg px-4 py-2 rounded-lg',
      'pães': 'bg-[#FF9800] text-white font-bold text-lg px-4 py-2 rounded-lg',
      'condimentos': 'bg-[#FF5722] text-white font-bold text-lg px-4 py-2 rounded-lg'
    };
    return colors[categoria.toLowerCase()] || 'bg-[#9E9E9E] text-white font-bold text-lg px-4 py-2 rounded-lg';
  };

  const groupByCategory = (items: EstoqueItem[]) => {
    // Primeiro, remover duplicatas baseado no nome do produto
    const uniqueItems = items.reduce((unique, item) => {
      const existingIndex = unique.findIndex(u => u.produto_nome === item.produto_nome);
      if (existingIndex >= 0) {
        // Se encontrou duplicata, manter apenas o mais recente
        if (new Date(item.updated_at) > new Date(unique[existingIndex].updated_at)) {
          unique[existingIndex] = item;
        }
      } else {
        unique.push(item);
      }
      return unique;
    }, [] as EstoqueItem[]);

    return uniqueItems.reduce((groups, item) => {
      const categoria = item.categoria || 'outros';
      if (!groups[categoria]) {
        groups[categoria] = [];
      }
      groups[categoria].push(item);
      return groups;
    }, {} as { [key: string]: EstoqueItem[] });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (estoque.length === 0) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        {/* Header com logo e navegação */}
        <div className="bg-card border-b border-border">
          <div className="flex justify-between items-center p-4">
            <PicotinhoLogo />
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                onClick={() => navigate('/')}
                className="flex items-center gap-2"
              >
                <Home className="w-4 h-4" />
                Início
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate('/menu')}
                className="flex items-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Voltar ao Menu
              </Button>
            </div>
          </div>
        </div>
        
        <div className="container mx-auto p-6">
          <div className="text-center p-8">
            <Package className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-lg sm:text-2xl font-bold mb-2 text-foreground">Estoque Vazio</h2>
            <p className="text-sm sm:text-base text-muted-foreground">
              Seu estoque será preenchido automaticamente quando você processar notas fiscais com IA
            </p>
          </div>
        </div>
      </div>
    );
  }

  const groupedEstoque = groupByCategory(estoque);
  
  // Contagem real de produtos únicos considerando todas as categorias
  const totalProdutosUnicos = Object.values(groupedEstoque).reduce((total, itens) => total + itens.length, 0);
  
  // Calcular subtotais por categoria com arredondamento correto
  const subtotaisPorCategoria = Object.entries(groupedEstoque).map(([categoria, itens]) => {
    const subtotal = itens.reduce((sum, item) => {
      const preco = item.preco_unitario_ultimo || 0;
      const quantidade = parseFloat(item.quantidade.toString());
      // Arredondar cada produto individualmente para 2 casas decimais
      const subtotalItem = Math.round((preco * quantidade) * 100) / 100;
      return sum + subtotalItem;
    }, 0);
    return { categoria, subtotal: Math.round(subtotal * 100) / 100 };
  }).sort((a, b) => b.subtotal - a.subtotal);
  
  const valorTotalEstoque = subtotaisPorCategoria.reduce((sum, cat) => sum + cat.subtotal, 0);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header com logo e navegação */}
      <div className="bg-card border-b border-border">
        <div className="flex justify-between items-center p-4">
          <PicotinhoLogo />
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              onClick={() => navigate('/')}
              className="flex items-center gap-2"
            >
              <Home className="w-4 h-4" />
              Início
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate('/menu')}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Voltar ao Menu
            </Button>
          </div>
        </div>
      </div>
      
      <div className="container mx-auto p-6">
        <div className="space-y-4">
          {/* Header da página */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <h1 className="text-xl sm:text-3xl font-bold text-foreground">Estoque Atual</h1>
            </div>
            
            {ultimaAtualizacao && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="w-4 h-4" />
                <span>Última atualização: {formatDate(ultimaAtualizacao)}</span>
              </div>
            )}
          </div>

          {/* Cards de resumo */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <Card className="md:col-span-2 lg:col-span-1">
              <CardHeader className="pb-2">
                <div className="text-center mb-3">
                  <p className="text-sm font-bold text-green-600">Valores em Estoque</p>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                   {/* Cabeçalho das colunas */}
                    <div className="grid grid-cols-[1.8fr_0.8fr_1.8fr_1.8fr_0.6fr] gap-1 pb-1 border-b text-xs text-muted-foreground font-medium">
                      <span>Categoria</span>
                      <span className="text-center">Itens</span>
                      <span className="text-center">Valor Pago</span>
                      <span className="text-right">Valor Atual</span>
                      <span className="text-right"></span>
                    </div>
                  
                  {subtotaisPorCategoria.map(({ categoria, subtotal }) => {
                    // Calcular subtotal com preços atuais para esta categoria
                    const itensCategoria = groupedEstoque[categoria] || [];
                    const subtotalPrecoAtual = itensCategoria.reduce((sum, item) => {
                      const precoAtual = encontrarPrecoAtual(item.produto_nome);
                      const preco = precoAtual?.valor_unitario || item.preco_unitario_ultimo || 0;
                      const quantidade = parseFloat(item.quantidade.toString());
                      return sum + (preco * quantidade);
                    }, 0);
                    
                    // Função para determinar o ícone de tendência com normalização
                    const getTrendIcon = () => {
                      const subtotalNormalizado = normalizeValue(subtotal);
                      const subtotalAtualNormalizado = normalizeValue(subtotalPrecoAtual);
                      
                      if (subtotalAtualNormalizado > subtotalNormalizado) {
                        return <ArrowUp className="w-3 h-3 text-green-600" />;
                      } else if (subtotalAtualNormalizado < subtotalNormalizado) {
                        return <ArrowDown className="w-3 h-3 text-red-600" />;
                      } else {
                        return <Minus className="w-3 h-3 text-gray-400" />;
                      }
                    };

                     const scrollToCategory = () => {
                       const element = document.getElementById(`categoria-${categoria.toLowerCase()}`);
                       if (element) {
                         element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                       }
                     };

                      // Calcular quantidade total de itens na categoria
                     const quantidadeItens = itensCategoria.length;

                      return (
                        <div key={categoria} className="grid grid-cols-[1.8fr_0.8fr_1.8fr_1.8fr_0.6fr] gap-1 text-xs sm:text-sm items-center py-1">
                          <button 
                            onClick={scrollToCategory}
                            className="capitalize text-blue-600 hover:text-blue-800 underline underline-offset-2 hover:no-underline cursor-pointer text-left font-medium"
                          >
                            {categoria}
                          </button>
                          <span className="font-medium text-muted-foreground text-center">{quantidadeItens}</span>
                         <span className="font-medium text-foreground text-center">{formatCurrency(subtotal)}</span>
                          <span className="font-medium text-blue-600 text-right">
                            {formatCurrency(subtotalPrecoAtual)}
                          </span>
                          <div className="flex justify-end">
                            {getTrendIcon()}
                          </div>
                       </div>
                     );
                  })}
                  
                    <div className="border-t pt-2 mt-2">
                      <div className="grid grid-cols-[1.8fr_0.8fr_1.8fr_1.8fr_0.6fr] gap-1 font-bold text-xs">
                        <span className="text-foreground">Total</span>
                        <span className="text-muted-foreground text-center">{totalProdutosUnicos}</span>
                       <span className="text-foreground text-center">{formatCurrency(valorTotalEstoque)}</span>
                       <span className="text-blue-600 text-right">
                         {formatCurrency(
                           Object.values(groupedEstoque).flat().reduce((total, item) => {
                             const precoAtual = encontrarPrecoAtual(item.produto_nome);
                             const preco = precoAtual?.valor_unitario || item.preco_unitario_ultimo || 0;
                             const quantidade = parseFloat(item.quantidade.toString());
                             return total + (preco * quantidade);
                           }, 0)
                         )}
                        </span>
                        <div className="flex justify-end">
                           {/* Ícone de tendência total com normalização */}
                          {(() => {
                            const totalAtual = Object.values(groupedEstoque).flat().reduce((total, item) => {
                              const precoAtual = encontrarPrecoAtual(item.produto_nome);
                              const preco = precoAtual?.valor_unitario || item.preco_unitario_ultimo || 0;
                              const quantidade = parseFloat(item.quantidade.toString());
                              return total + (preco * quantidade);
                            }, 0);
                            
                            const totalAtualNormalizado = normalizeValue(totalAtual);
                            const valorTotalNormalizado = normalizeValue(valorTotalEstoque);
                            
                            if (totalAtualNormalizado > valorTotalNormalizado) {
                              return <ArrowUp className="w-3 h-3 text-green-600" />;
                            } else if (totalAtualNormalizado < valorTotalNormalizado) {
                              return <ArrowDown className="w-3 h-3 text-red-600" />;
                            } else {
                              return <Minus className="w-3 h-3 text-gray-400" />;
                            }
                          })()}
                       </div>
                     </div>
                  </div>
                </div>
              </CardContent>
            </Card>


          </div>

          {/* Botões de ação para administração do estoque */}
          <div className="flex flex-wrap gap-4 justify-end">
            <Button
              variant={modoEdicao ? "default" : "secondary"}
              size="sm"
              onClick={() => setModoEdicao(!modoEdicao)}
              className="flex items-center gap-1 text-xs px-3 py-1 h-7 bg-green-600 hover:bg-green-700 text-white"
            >
              <Edit3 className="w-3 h-3" />
              {modoEdicao ? "Sair da Edição" : "Ajustar o Estoque"}
            </Button>
            
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="destructive"
                  size="sm"
                  className="flex items-center gap-1 text-xs px-3 py-1 h-7"
                >
                  <Trash2 className="w-3 h-3" />
                  Limpar Estoque
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Confirmar Limpeza do Estoque</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta ação irá remover TODOS os produtos do seu estoque permanentemente. 
                    <br /><br />
                    <strong>⚠️ Esta ação é irreversível!</strong>
                    <br /><br />
                    Você terá que processar suas notas fiscais novamente para recriar o estoque. Tem certeza que deseja continuar?
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction 
                    onClick={limparEstoque}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Sim, limpar tudo
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

          {/* Lista de produtos por categoria */}
          <div className="space-y-4">
            {Object.entries(groupedEstoque).map(([categoria, itens]) => (
              <Card key={categoria} id={`categoria-${categoria.toLowerCase()}`}>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={`${getCategoriaColor(categoria)} text-sm font-bold`}>
                      {categoria.charAt(0).toUpperCase() + categoria.slice(1)}
                    </Badge>
                    <span className="text-sm font-medium text-primary">
                      {itens.length} {itens.length === 1 ? 'produto' : 'produtos'}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="py-3">
                  <div className="space-y-1">
                    {itens.map((item) => {
                      const precoAtual = encontrarPrecoAtual(item.produto_nome);
                      const precoParaExibir = precoAtual?.valor_unitario || item.preco_unitario_ultimo;
                      const quantidade = parseFloat(item.quantidade.toString());
                      
                        return (
                          <div 
                            key={item.id} 
                            className="flex items-center py-2 border-b border-border last:border-0"
                          >
                            <div className="flex-1 overflow-hidden relative">
                               <h3 className="text-xs font-medium text-foreground leading-tight relative">
                                 {item.produto_nome}
                                 {/* Botão de ajuste sobreposto ao título do produto */}
                                 {modoEdicao && (
                                   <Button
                                     onClick={() => abrirModalEdicao(item)}
                                     className="absolute -top-1 -right-2 h-6 px-3 bg-blue-100 hover:bg-blue-200 text-blue-700 text-xs font-medium rounded-md border border-blue-300 shadow-sm transform hover:scale-105 transition-all duration-200 flex items-center gap-1"
                                     size="sm"
                                   >
                                     <Edit3 className="w-3 h-3" />
                                     Ajustar
                                   </Button>
                                 )}
                               </h3>
                             <p className="text-xs text-muted-foreground space-y-1">
                               {item.preco_unitario_ultimo && (
                                 <>
                                   <div>
                                     Pagou- {formatCurrency(item.preco_unitario_ultimo)} por {item.unidade_medida.replace('Unidade', 'Un')} - Subt.: {formatCurrency((item.preco_unitario_ultimo * quantidade))}
                                   </div>
                                    {precoAtual ? (
                                      <div className="text-blue-600 font-medium flex items-center gap-1">
                                        <span>
                                          Atual- {formatCurrency(precoAtual.valor_unitario)} por {item.unidade_medida.replace('Unidade', 'Un')} - Subt.: {formatCurrency((precoAtual.valor_unitario * quantidade))}
                                        </span>
                                        <span className="text-xs text-muted-foreground ml-2">
                                          Última Atualização: {new Date(item.updated_at).toLocaleString('pt-BR', {
                                            day: '2-digit',
                                            month: '2-digit',
                                            year: 'numeric',
                                            hour: '2-digit',
                                            minute: '2-digit'
                                          })}
                                        </span>
                                       {(() => {
                                         const subtotalPago = normalizeValue(item.preco_unitario_ultimo * quantidade);
                                         const subtotalAtual = normalizeValue(precoAtual.valor_unitario * quantidade);
                                         
                                         if (subtotalAtual > subtotalPago) {
                                           return <ArrowUp className="w-3 h-3 text-green-600 flex-shrink-0" />;
                                         } else if (subtotalAtual < subtotalPago) {
                                           return <ArrowDown className="w-3 h-3 text-red-600 flex-shrink-0" />;
                                         } else {
                                           return <Minus className="w-3 h-3 text-gray-400 flex-shrink-0" />;
                                         }
                                       })()}
                                     </div>
                                   ) : (
                                     <div className="text-blue-600 font-medium flex items-center gap-1">
                                       <span>
                                         Atual- {formatCurrency(item.preco_unitario_ultimo)} por {item.unidade_medida.replace('Unidade', 'Un')} - Subt.: {formatCurrency((item.preco_unitario_ultimo * quantidade))}
                                       </span>
                                       <Minus className="w-3 h-3 text-gray-400 flex-shrink-0" />
                                     </div>
                                   )}
                                 </>
                               )}
                             </p>
                           </div>
                           
                           <div className="text-right ml-2 flex-shrink-0">
                             <p className="text-xs sm:text-sm font-bold text-foreground">
                               {quantidade.toFixed(2)} {item.unidade_medida.replace('Unidade', 'Un')}
                             </p>
                             <div className="text-xs text-muted-foreground">
                               <p>ATUALIZADO</p>
                               <p>{new Date(item.updated_at).toLocaleDateString('pt-BR')}</p>
                               <p>{new Date(item.updated_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
                             </div>
                           </div>
                         </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>

      {/* Modal de Edição */}
      <Dialog open={!!itemEditando} onOpenChange={fecharModalEdicao}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ajustar Quantidade</DialogTitle>
          </DialogHeader>
          
          {itemEditando && (
            <div className="space-y-4">
              <div className="text-center">
                <h3 className="font-semibold text-lg">{itemEditando.produto_nome}</h3>
                <p className="text-sm text-muted-foreground">
                  Quantidade atual: {itemEditando.quantidade} {itemEditando.unidade_medida.replace('Unidade', 'Un')}
                </p>
              </div>
              
              <div className="text-center">
                <p className="text-2xl font-bold text-blue-600">
                  {novaQuantidade.toFixed(2)} {itemEditando.unidade_medida.replace('Unidade', 'Un')}
                </p>
              </div>
              
              <div className="flex justify-center gap-3">
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => ajustarQuantidade('diminuir')}
                  className="h-12 w-12 p-0"
                >
                  <Minus className="w-6 h-6" />
                </Button>
                
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => ajustarQuantidade('zerar')}
                  className="h-12 px-4"
                >
                  Zerar
                </Button>
                
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => ajustarQuantidade('aumentar')}
                  className="h-12 w-12 p-0"
                >
                  <Plus className="w-6 h-6" />
                </Button>
              </div>
              
              <div className="text-center text-xs text-muted-foreground">
                {itemEditando.unidade_medida.toLowerCase().includes('kg') 
                  ? 'Cada clique ajusta 0,01 Kg (10 gramas)'
                  : 'Cada clique ajusta 1 unidade'
                }
              </div>
              
              <div className="flex gap-2 mt-6">
                <Button variant="outline" onClick={fecharModalEdicao} className="flex-1">
                  Cancelar
                </Button>
                <Button onClick={salvarAjuste} className="flex-1">
                  Confirmar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EstoqueAtual;