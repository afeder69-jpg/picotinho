import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Package, Calendar, AlertCircle, ArrowLeft, RefreshCw, Home } from 'lucide-react';
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
  const [loading, setLoading] = useState(true);
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState<string>('');
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    loadEstoque();
  }, []);

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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('pt-BR');
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const getCategoriaColor = (categoria: string) => {
    const colors: { [key: string]: string } = {
      'frutas': 'bg-green-100 text-green-800 border-green-200',
      'verduras': 'bg-green-100 text-green-800 border-green-200',
      'legumes': 'bg-orange-100 text-orange-800 border-orange-200',
      'laticínios': 'bg-blue-100 text-blue-800 border-blue-200',
      'bebidas': 'bg-purple-100 text-purple-800 border-purple-200',
      'carnes': 'bg-red-100 text-red-800 border-red-200',
      'cereais': 'bg-yellow-100 text-yellow-800 border-yellow-200',
      'pães': 'bg-amber-100 text-amber-800 border-amber-200',
      'condimentos': 'bg-gray-100 text-gray-800 border-gray-200',
      'outros': 'bg-gray-100 text-gray-800 border-gray-200'
    };
    return colors[categoria.toLowerCase()] || 'bg-gray-100 text-gray-800 border-gray-200';
  };

  const groupByCategory = (items: EstoqueItem[]) => {
    return items.reduce((groups, item) => {
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
            <h2 className="text-2xl font-bold mb-2 text-foreground">Estoque Vazio</h2>
            <p className="text-muted-foreground">
              Seu estoque será preenchido automaticamente quando você processar notas fiscais com IA
            </p>
          </div>
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
        <div className="space-y-6">
          {/* Header da página */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-3xl font-bold text-foreground">Estoque Atual</h1>
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

          {/* Cards de resumo */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Valor Total do Estoque
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">
                  {formatCurrency(valorTotalEstoque)}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total de Produtos
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">
                  {estoque.length}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Quantidade Total
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">
                  {totalItens.toFixed(2)}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Categorias
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">
                  {Object.keys(groupedEstoque).length}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Lista de produtos por categoria */}
          <div className="space-y-6">
            {Object.entries(groupedEstoque).map(([categoria, itens]) => (
              <Card key={categoria}>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={getCategoriaColor(categoria)}>
                      {categoria.charAt(0).toUpperCase() + categoria.slice(1)}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {itens.length} {itens.length === 1 ? 'produto' : 'produtos'}
                    </span>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {itens.map((item) => (
                      <div key={item.id} className="flex justify-between items-center py-3 border-b border-border last:border-0">
                        <div className="flex-1">
                          <h3 className="font-medium text-foreground">
                            {item.produto_nome}
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            {item.preco_unitario_ultimo && (
                              <>
                                {formatCurrency(item.preco_unitario_ultimo)} por {item.unidade_medida}
                                {' • '}
                                Subtotal: {formatCurrency((item.preco_unitario_ultimo * parseFloat(item.quantidade.toString())))}
                              </>
                            )}
                          </p>
                        </div>
                        
                        <div className="text-right">
                          <p className="text-lg font-bold text-foreground">
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
    </div>
  );
};

export default EstoqueAtual;