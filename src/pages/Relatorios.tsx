import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, FileText, Calendar, Filter, Download } from "lucide-react";
import { format, parseISO } from "date-fns";
import { pt } from "date-fns/locale";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { carregarCategorias } from "@/lib/categorias";

type TipoRelatorio = "compras" | "consumos" | "todos";

interface ItemRelatorio {
  data: string;
  produto: string;
  categoria: string;
  quantidade: number;
  valor: number;
  mercado: string;
  tipo: "Compra" | "Consumo";
}

interface DadosGrafico {
  periodo: string;
  valor: number;
}

interface EstabelecimentoInfo {
  nome: string;
  cnpj: string;
}

export default function Relatorios() {
  const navigate = useNavigate();
  const { user } = useAuth();
  
  // Estados dos filtros
  const [tipoRelatorio, setTipoRelatorio] = useState<TipoRelatorio>("todos");
  const [categoria, setCategoria] = useState<string>("todas");
  const [produto, setProduto] = useState<string>("");
  const [mercado, setMercado] = useState<string>("todos");
  const [dataInicial, setDataInicial] = useState<string>("");
  const [dataFinal, setDataFinal] = useState<string>("");
  
  // Estados dos dados
  const [dados, setDados] = useState<ItemRelatorio[]>([]);
  const [dadosGrafico, setDadosGrafico] = useState<DadosGrafico[]>([]);
  const [produtos, setProdutos] = useState<string[]>([]);
  const [estabelecimentos, setEstabelecimentos] = useState<EstabelecimentoInfo[]>([]);
  const [categorias, setCategorias] = useState<{id: string; nome: string; sinonimos: string[]}[]>([]);
  const [carregando, setCarregando] = useState(false);
  
  // Estados dos totais
  const [totalValor, setTotalValor] = useState(0);
  const [totalItens, setTotalItens] = useState(0);

  // Carregar produtos únicos do estoque do usuário para autocomplete
  useEffect(() => {
    const carregarProdutos = async () => {
      if (!user) return;
      
      const { data } = await supabase
        .from('estoque_app')
        .select('produto_nome')
        .eq('user_id', user.id)
        .order('produto_nome');
      
      if (data) {
        const produtosUnicos = [...new Set(data.map(item => item.produto_nome))];
        setProdutos(produtosUnicos);
      }
    };
    
    carregarProdutos();
  }, [user]);

  // Carregar categorias do sistema
  useEffect(() => {
    const carregarCategoriasAsync = async () => {
      try {
        const categoriasData = await carregarCategorias();
        setCategorias(categoriasData);
      } catch (error) {
        console.error('Erro ao carregar categorias:', error);
      }
    };
    
    carregarCategoriasAsync();
  }, []);

  // Carregar estabelecimentos onde o usuário comprou
  useEffect(() => {
    const carregarEstabelecimentos = async () => {
      if (!user) return;
      
      const { data } = await supabase
        .from('notas_imagens')
        .select('dados_extraidos')
        .eq('usuario_id', user.id)
        .eq('processada', true)
        .not('dados_extraidos', 'is', null);
      
      if (data) {
        const estabelecimentosSet = new Set<string>();
        const estabelecimentosInfo: EstabelecimentoInfo[] = [];
        
        data.forEach(nota => {
          if (nota.dados_extraidos) {
            const dadosExtraidos = nota.dados_extraidos as any;
            const nome = dadosExtraidos?.estabelecimento?.nome || 
                        dadosExtraidos?.supermercado?.nome || 
                        dadosExtraidos?.emitente?.nome || 'Estabelecimento não identificado';
            const cnpj = dadosExtraidos?.estabelecimento?.cnpj || 
                        dadosExtraidos?.supermercado?.cnpj || 
                        dadosExtraidos?.emitente?.cnpj || dadosExtraidos?.cnpj || '';
            
            const chave = `${nome}-${cnpj}`;
            if (!estabelecimentosSet.has(chave)) {
              estabelecimentosSet.add(chave);
              estabelecimentosInfo.push({ nome, cnpj });
            }
          }
        });
        
        setEstabelecimentos(estabelecimentosInfo);
      }
    };
    
    carregarEstabelecimentos();
  }, [user]);

  const gerarRelatorio = async () => {
    if (!user) return;
    
    setCarregando(true);
    
    try {
      let todosOsDados: ItemRelatorio[] = [];
      
      // 1. Buscar dados de COMPRAS (entradas)
      if (tipoRelatorio === "compras" || tipoRelatorio === "todos") {
        // Carregar produtos do estoque para mapeamento de categorias
        const { data: estoqueData } = await supabase
          .from('estoque_app')
          .select('produto_nome, categoria')
          .eq('user_id', user.id);
        
        // Criar mapa produto → categoria para lookup eficiente
        const mapaCategorias = new Map<string, string>();
        if (estoqueData) {
          estoqueData.forEach(item => {
            const nome = item.produto_nome.toUpperCase().trim();
            mapaCategorias.set(nome, item.categoria);
          });
        }
        
        const { data: notasData } = await supabase
          .from('notas_imagens')
          .select('dados_extraidos, created_at')
          .eq('usuario_id', user.id)
          .eq('processada', true)
          .not('dados_extraidos', 'is', null);
        
        if (notasData) {
          notasData.forEach(nota => {
            if (nota.dados_extraidos) {
              const dadosExtraidos = nota.dados_extraidos as any;
              const nomeEstabelecimento = dadosExtraidos?.estabelecimento?.nome || 
                                        dadosExtraidos?.supermercado?.nome || 
                                        dadosExtraidos?.emitente?.nome || 'Não identificado';
              
              if (dadosExtraidos.itens) {
                dadosExtraidos.itens.forEach((item: any) => {
                  const produtoNome = item.descricao || item.nome || '';
                  const quantidade = parseFloat(item.quantidade || 0);
                  const valorUnitario = parseFloat(item.valor_unitario || 0);
                  const valorTotal = quantidade * valorUnitario;
                  
                  if (produtoNome && quantidade > 0) {
                    // Buscar categoria do produto
                    const nomeItem = produtoNome.toUpperCase().trim();
                    let categoria = 'Não categorizado';
                    
                    // 1. Busca exata
                    if (mapaCategorias.has(nomeItem)) {
                      categoria = mapaCategorias.get(nomeItem)!;
                    } else {
                      // 2. Busca por similaridade
                      for (const [nomeProduto, categoriaProduto] of mapaCategorias) {
                        if (nomeItem.includes(nomeProduto) || nomeProduto.includes(nomeItem)) {
                          categoria = categoriaProduto;
                          break;
                        }
                      }
                    }
                    
                    todosOsDados.push({
                      data: nota.created_at?.split('T')[0] || '',
                      produto: produtoNome,
                      categoria: categoria,
                      quantidade,
                      valor: valorTotal,
                      mercado: nomeEstabelecimento,
                      tipo: "Compra"
                    });
                  }
                });
              }
            }
          });
        }
      }
      
      // 2. Buscar dados de CONSUMOS (saídas)
      if (tipoRelatorio === "consumos" || tipoRelatorio === "todos") {
        const { data: consumosData } = await supabase
          .from('consumos_app')
          .select(`
            data_consumo,
            quantidade,
            categoria,
            estoque_app!inner(produto_nome, preco_unitario_ultimo)
          `)
          .eq('user_id', user.id);
        
        if (consumosData) {
          consumosData.forEach(consumo => {
            const estoque = consumo.estoque_app as any;
            const valorUnitario = estoque.preco_unitario_ultimo || 0;
            const valorTotal = consumo.quantidade * valorUnitario;
            
            todosOsDados.push({
              data: consumo.data_consumo.split('T')[0],
              produto: estoque.produto_nome,
              categoria: consumo.categoria || 'Não categorizado',
              quantidade: consumo.quantidade,
              valor: valorTotal,
              mercado: "Casa (consumo)",
              tipo: "Consumo"
            });
          });
        }
      }
      
      // 3. Aplicar filtros
      let dadosFiltrados = todosOsDados;
      
      // Filtro por categoria
      if (categoria !== "todas") {
        dadosFiltrados = dadosFiltrados.filter(item => item.categoria === categoria);
      }
      
      // Filtro por produto
      if (produto) {
        dadosFiltrados = dadosFiltrados.filter(item => 
          item.produto.toLowerCase().includes(produto.toLowerCase())
        );
      }
      
      // Filtro por mercado
      if (mercado !== "todos") {
        dadosFiltrados = dadosFiltrados.filter(item => item.mercado === mercado);
      }
      
      // Filtro por período
      if (dataInicial) {
        dadosFiltrados = dadosFiltrados.filter(item => item.data >= dataInicial);
      }
      if (dataFinal) {
        dadosFiltrados = dadosFiltrados.filter(item => item.data <= dataFinal);
      }
      
      // 4. Ordenar por data (mais recente primeiro)
      dadosFiltrados.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
      
      // 5. Calcular totais
      const valorTotal = dadosFiltrados.reduce((sum, item) => sum + item.valor, 0);
      const quantidadeTotal = dadosFiltrados.reduce((sum, item) => sum + item.quantidade, 0);
      
      // 6. Preparar dados para o gráfico (agrupado por mês)
      const dadosAgrupados = new Map<string, number>();
      dadosFiltrados.forEach(item => {
        const mesPeriodo = format(parseISO(item.data), 'MMM/yyyy', { locale: pt });
        dadosAgrupados.set(mesPeriodo, (dadosAgrupados.get(mesPeriodo) || 0) + item.valor);
      });
      
      const dadosGraficoArray = Array.from(dadosAgrupados.entries())
        .map(([periodo, valor]) => ({ periodo, valor }))
        .sort((a, b) => new Date(a.periodo).getTime() - new Date(b.periodo).getTime());
      
      setDados(dadosFiltrados);
      setDadosGrafico(dadosGraficoArray);
      setTotalValor(valorTotal);
      setTotalItens(quantidadeTotal);
      
      toast.success(`Relatório gerado com ${dadosFiltrados.length} registros`);
      
    } catch (error) {
      console.error('Erro ao gerar relatório:', error);
      toast.error('Erro ao gerar relatório');
    } finally {
      setCarregando(false);
    }
  };

  const limparFiltros = () => {
    setTipoRelatorio("todos");
    setCategoria("todas");
    setProduto("");
    setMercado("todos");
    setDataInicial("");
    setDataFinal("");
    setDados([]);
    setDadosGrafico([]);
    setTotalValor(0);
    setTotalItens(0);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b border-border p-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-semibold">Relatórios</h1>
          </div>
        </div>
      </header>

      <div className="p-4 space-y-6">
        {/* Filtros */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filtros do Relatório
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Tipo de Relatório */}
              <div className="space-y-2">
                <Label>Tipo de Relatório</Label>
                <Select value={tipoRelatorio} onValueChange={(value: TipoRelatorio) => setTipoRelatorio(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    <SelectItem value="compras">Compras (Entradas)</SelectItem>
                    <SelectItem value="consumos">Consumos (Saídas)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Categoria */}
              <div className="space-y-2">
                <Label>Categoria</Label>
                <Select value={categoria} onValueChange={setCategoria}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todas">Todas as categorias</SelectItem>
                    {categorias.map(cat => (
                      <SelectItem key={cat.nome} value={cat.nome}>{cat.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Produto */}
              <div className="space-y-2">
                <Label>Produto</Label>
                <Input
                  placeholder="Digite o nome do produto"
                  value={produto}
                  onChange={(e) => setProduto(e.target.value)}
                  list="produtos-list"
                />
                <datalist id="produtos-list">
                  {produtos.map(prod => (
                    <option key={prod} value={prod} />
                  ))}
                </datalist>
              </div>

              {/* Mercado */}
              <div className="space-y-2">
                <Label>Mercado</Label>
                <Select value={mercado} onValueChange={setMercado}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os mercados</SelectItem>
                    {estabelecimentos.map((est, index) => (
                      <SelectItem key={index} value={est.nome}>{est.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Data Inicial */}
              <div className="space-y-2">
                <Label>Data Inicial</Label>
                <Input
                  type="date"
                  value={dataInicial}
                  onChange={(e) => setDataInicial(e.target.value)}
                />
              </div>

              {/* Data Final */}
              <div className="space-y-2">
                <Label>Data Final</Label>
                <Input
                  type="date"
                  value={dataFinal}
                  onChange={(e) => setDataFinal(e.target.value)}
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={gerarRelatorio} disabled={carregando}>
                {carregando ? "Gerando..." : "Gerar Relatório"}
              </Button>
              <Button variant="outline" onClick={limparFiltros}>
                Limpar Filtros
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Totais */}
        {dados.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-6">
                <div className="text-2xl font-bold text-primary">
                  {dados.length}
                </div>
                <p className="text-sm text-muted-foreground">Total de Registros</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="text-2xl font-bold text-green-600">
                  R$ {totalValor.toFixed(2)}
                </div>
                <p className="text-sm text-muted-foreground">Valor Total</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="text-2xl font-bold text-blue-600">
                  {totalItens.toFixed(2)}
                </div>
                <p className="text-sm text-muted-foreground">Quantidade Total</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Conteúdo Principal */}
        {dados.length > 0 && (
          <Tabs defaultValue="tabela" className="space-y-4">
            <TabsList>
              <TabsTrigger value="tabela">Tabela</TabsTrigger>
              <TabsTrigger value="grafico">Gráfico</TabsTrigger>
            </TabsList>

            <TabsContent value="tabela">
              <Card>
                <CardHeader>
                  <CardTitle>Dados do Relatório</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Data</TableHead>
                          <TableHead>Produto</TableHead>
                          <TableHead>Categoria</TableHead>
                          <TableHead>Quantidade</TableHead>
                          <TableHead>Valor</TableHead>
                          <TableHead>Mercado</TableHead>
                          <TableHead>Tipo</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dados.map((item, index) => (
                          <TableRow key={index}>
                            <TableCell>{format(parseISO(item.data), 'dd/MM/yyyy', { locale: pt })}</TableCell>
                            <TableCell>{item.produto}</TableCell>
                            <TableCell>{item.categoria}</TableCell>
                            <TableCell>{item.quantidade.toFixed(2)}</TableCell>
                            <TableCell>R$ {item.valor.toFixed(2)}</TableCell>
                            <TableCell>{item.mercado}</TableCell>
                            <TableCell>
                              <Badge variant={item.tipo === "Compra" ? "default" : "destructive"}>
                                {item.tipo}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="grafico">
              <Card>
                <CardHeader>
                  <CardTitle>Gráfico por Período</CardTitle>
                </CardHeader>
                <CardContent>
                  {dadosGrafico.length > 0 ? (
                    <ResponsiveContainer width="100%" height={400}>
                      <BarChart data={dadosGrafico}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="periodo" />
                        <YAxis />
                        <Tooltip 
                          formatter={(value: number) => [`R$ ${value.toFixed(2)}`, 'Valor']}
                          labelFormatter={(label) => `Período: ${label}`}
                        />
                        <Bar dataKey="valor" fill="hsl(var(--primary))" />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-center text-muted-foreground py-8">
                      Nenhum dado disponível para exibir no gráfico
                    </p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}

        {/* Estado vazio */}
        {!carregando && dados.length === 0 && (
          <Card>
            <CardContent className="py-8">
              <div className="text-center space-y-2">
                <FileText className="h-12 w-12 text-muted-foreground mx-auto" />
                <p className="text-muted-foreground">
                  Configure os filtros e clique em "Gerar Relatório" para visualizar os dados
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}