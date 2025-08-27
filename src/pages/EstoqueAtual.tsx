import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Package, Calendar, AlertCircle, ArrowLeft } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';

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
  const [loading, setLoading] = useState(true);
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState<string>('');
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    loadEstoque();
  }, []);

  const loadEstoque = async () => {
    try {
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
          return new Date(item.updated_at) > new Date(latest) ? item.updated_at : latest;
        }, data[0].updated_at);
        setUltimaAtualizacao(ultimaData);
      }
      
    } catch (error) {
      console.error('Erro ao carregar estoque:', error);
      toast({
        title: "Erro",
        description: "Erro ao carregar estoque atual",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatCurrency = (amount: number | null) => {
    if (!amount) return 'N/A';
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(amount);
  };

  const getCategoriaColor = (categoria: string) => {
    const colors: { [key: string]: string } = {
      'laticínios': 'bg-blue-100 text-blue-800',
      'bebidas': 'bg-purple-100 text-purple-800',
      'frutas': 'bg-green-100 text-green-800',
      'verduras': 'bg-green-100 text-green-800',
      'carnes': 'bg-red-100 text-red-800',
      'pães': 'bg-yellow-100 text-yellow-800',
      'grãos': 'bg-orange-100 text-orange-800',
      'limpeza': 'bg-cyan-100 text-cyan-800',
      'higiene': 'bg-pink-100 text-pink-800',
      'outros': 'bg-gray-100 text-gray-800'
    };
    return colors[categoria.toLowerCase()] || colors['outros'];
  };

  const groupByCategory = (items: EstoqueItem[]) => {
    return items.reduce((groups, item) => {
      const categoria = item.categoria || 'Outros';
      if (!groups[categoria]) {
        groups[categoria] = [];
      }
      groups[categoria].push(item);
      return groups;
    }, {} as { [key: string]: EstoqueItem[] });
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (estoque.length === 0) {
  return (
    <div className="container mx-auto p-6">
      {/* Botão Voltar */}
      <div className="mb-4">
        <Button
          variant="outline"
          onClick={() => navigate('/menu')}
          className="flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar ao Menu
        </Button>
      </div>
      
      <div className="text-center p-8">
        <Package className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
        <h2 className="text-2xl font-bold mb-2">Estoque Vazio</h2>
        <p className="text-muted-foreground">
          Seu estoque será preenchido automaticamente quando você processar notas fiscais com IA
        </p>
      </div>
    </div>
  );
  }

  const groupedEstoque = groupByCategory(estoque);
  const totalItens = estoque.reduce((sum, item) => sum + parseFloat(item.quantidade.toString()), 0);
  const valorTotalEstoque = estoque.reduce((sum, item) => {
    const preco = item.preco_unitario_ultimo || 0;
    const quantidade = parseFloat(item.quantidade.toString());
    return sum + (preco * quantidade);
  }, 0);

  return (
    <div className="container mx-auto p-6">
      {/* Botão Voltar */}
      <div className="mb-4">
        <Button
          variant="outline"
          onClick={() => navigate('/menu')}
          className="flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar ao Menu
        </Button>
      </div>
      
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold">Estoque Atual</h1>
            <p className="text-muted-foreground mt-1">
              Controle automático baseado nas suas notas fiscais
            </p>
          </div>
          
          {ultimaAtualizacao && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="w-4 h-4" />
              <span>Última atualização: {formatDate(ultimaAtualizacao)}</span>
            </div>
          )}
        </div>

        {/* Valor Total do Estoque */}
        <Card className="bg-gradient-to-r from-green-50 to-emerald-50 border-green-200">
          <CardContent className="p-4">
            <div className="text-center">
              <p className="text-sm text-green-700 font-medium mb-1">Valor Total em Estoque</p>
              <p className="text-2xl font-bold text-green-800">{formatCurrency(valorTotalEstoque)}</p>
              <p className="text-xs text-green-600 mt-1">
                Baseado nos últimos preços registrados
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Resumo */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Package className="w-8 h-8 text-blue-600" />
                <div>
                  <p className="text-sm text-muted-foreground">Total de Produtos</p>
                  <p className="text-2xl font-bold">{estoque.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <AlertCircle className="w-8 h-8 text-green-600" />
                <div>
                  <p className="text-sm text-muted-foreground">Itens em Estoque</p>
                  <p className="text-2xl font-bold">{totalItens.toFixed(2)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Package className="w-8 h-8 text-purple-600" />
                <div>
                  <p className="text-sm text-muted-foreground">Categorias</p>
                  <p className="text-2xl font-bold">{Object.keys(groupedEstoque).length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Lista por Categoria */}
        <div className="space-y-6">
          {Object.entries(groupedEstoque).map(([categoria, items]) => (
            <Card key={categoria}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Badge className={getCategoriaColor(categoria)}>
                    {categoria}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    ({items.length} {items.length === 1 ? 'produto' : 'produtos'})
                  </span>
                </CardTitle>
              </CardHeader>
              
              <CardContent>
                <div className="space-y-3">
                  {items.map((item) => (
                    <div key={item.id} className="flex justify-between items-center p-3 bg-muted/30 rounded-lg">
                      <div className="flex-1">
                        <h4 className="font-medium">{item.produto_nome}</h4>
                        <p className="text-sm text-muted-foreground">
                          Unidade: {item.unidade_medida}
                          {item.preco_unitario_ultimo && (
                            <span className="ml-3">
                              Último preço: {formatCurrency(item.preco_unitario_ultimo)}
                            </span>
                          )}
                        </p>
                      </div>
                      
                      <div className="text-right">
                        <p className="text-lg font-bold">
                          {parseFloat(item.quantidade.toString()).toFixed(2)} {item.unidade_medida}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Atualizado: {formatDate(item.updated_at)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};

export default EstoqueAtual;