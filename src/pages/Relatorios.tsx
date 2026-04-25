import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, Calendar, Filter, Download } from "lucide-react";
import { normalizarParaBusca } from "@/lib/utils";
import PageHeader from "@/components/PageHeader";
import { format, parseISO } from "date-fns";
import { pt } from "date-fns/locale";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { carregarCategorias, limparCacheCategories } from "@/lib/categorias";
import { extrairDataCompraISO, extrairValorTotalNota, extrairValorItem } from "@/lib/notasFiscais";

/**
 * REGRA: a fonte ÚNICA de DATA é a data oficial da compra/NF
 * (extrairDataCompraISO) e a fonte ÚNICA de VALOR é o valor total oficial
 * da nota (extrairValorTotalNota). Soma item-a-item é apenas fallback.
 * Ver src/lib/notasFiscais.ts.
 */

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
  cor: string;
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
        console.log('🔥 Iniciando carregamento de categorias...');
        
        // Limpar cache primeiro para forçar reload
        limparCacheCategories();
        
        const categoriasData = await carregarCategorias();
        console.log('📊 Categorias recebidas:', categoriasData.length, categoriasData);
        
        setCategorias(categoriasData);
        
        // Se ainda estiver vazio, tentar novamente após 1 segundo
        if (categoriasData.length === 0) {
          console.log('⚠️ Nenhuma categoria encontrada, tentando novamente...');
          setTimeout(async () => {
            limparCacheCategories();
            const retryData = await carregarCategorias();
            console.log('🔄 Tentativa 2 - Categorias:', retryData.length);
            setCategorias(retryData);
          }, 1000);
        }
        
      } catch (error) {
        console.error('❌ Erro ao carregar categorias:', error);
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
          .select('id, dados_extraidos, created_at')
          .eq('usuario_id', user.id)
          .eq('processada', true)
          .not('dados_extraidos', 'is', null);

        // Mapa: nota_id -> { data_iso, valor_total_oficial, mercado }
        // Usado para reconciliar totais com "Minhas Notas" (valor oficial da NF).
        var totaisOficiaisPorNota = new Map<string, { data: string; valor: number; mercado: string }>();

        if (notasData) {
          notasData.forEach(nota => {
            if (nota.dados_extraidos) {
              const dadosExtraidos = nota.dados_extraidos as any;
              const nomeEstabelecimento = dadosExtraidos?.estabelecimento?.nome || 
                                        dadosExtraidos?.supermercado?.nome || 
                                        dadosExtraidos?.emitente?.nome || 'Não identificado';

              // FONTE ÚNICA DE DATA: data oficial da compra/NF (sem fallback para created_at).
              const dataNota = extrairDataCompraISO(dadosExtraidos);
              if (!dataNota) return; // sem data oficial, não entra no relatório

              // FONTE ÚNICA DE VALOR: valor total oficial da nota.
              const valorOficial = extrairValorTotalNota(dadosExtraidos);
              if (valorOficial != null) {
                totaisOficiaisPorNota.set(nota.id, {
                  data: dataNota,
                  valor: valorOficial,
                  mercado: nomeEstabelecimento,
                });
              }

              if (dadosExtraidos.itens) {
                dadosExtraidos.itens.forEach((item: any) => {
                  const produtoNome = item.descricao || item.nome || '';
                  const quantidade = parseFloat(item.quantidade || 0);
                  // Item-a-item: prioriza item.valor_total quando existir.
                  const valorTotal = extrairValorItem(item);

                  if (produtoNome && quantidade > 0) {
                    // Buscar categoria do produto
                    const nomeItem = produtoNome.toUpperCase().trim();
                    let categoria = 'Outros';
                    
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
                      data: dataNota,
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
        // Expor para uso no cálculo de totais abaixo
        (gerarRelatorio as any)._totaisOficiais = totaisOficiaisPorNota;
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
              categoria: consumo.categoria || 'Outros',
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
        dadosFiltrados = dadosFiltrados.filter(item => 
          item.categoria?.toUpperCase() === categoria.toUpperCase()
        );
      }
      
      // Filtro por produto
      if (produto) {
        const termoNorm = normalizarParaBusca(produto);
        dadosFiltrados = dadosFiltrados.filter(item => 
          normalizarParaBusca(item.produto).includes(termoNorm)
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
      // Quando NÃO houver filtros de categoria/produto/mercado e o tipo incluir "compras",
      // usamos o VALOR OFICIAL DA NOTA (fonte única) para casar com "Minhas Notas".
      // Caso contrário, usamos a soma item-a-item (necessária para refletir o filtro).
      const semFiltrosDeRecorte = categoria === "todas" && !produto && mercado === "todos";
      const incluiCompras = tipoRelatorio === "compras" || tipoRelatorio === "todos";
      const totaisOficiais: Map<string, { data: string; valor: number; mercado: string }> | undefined =
        (gerarRelatorio as any)._totaisOficiais;

      let valorTotal = 0;
      let dadosGraficoArray: DadosGrafico[] = [];

      // Filtro de período aplicável às notas oficiais
      const notasOficiaisFiltradas = totaisOficiais
        ? Array.from(totaisOficiais.values()).filter(n => {
            if (dataInicial && n.data < dataInicial) return false;
            if (dataFinal && n.data > dataFinal) return false;
            return true;
          })
        : [];

      const usarValorOficial = semFiltrosDeRecorte && incluiCompras && notasOficiaisFiltradas.length > 0;

      if (usarValorOficial) {
        // Total = soma dos valores oficiais das notas + valores de consumos (se houver)
        const totalNotas = notasOficiaisFiltradas.reduce((s, n) => s + n.valor, 0);
        const totalConsumos = dadosFiltrados
          .filter(d => d.tipo === "Consumo")
          .reduce((s, d) => s + d.valor, 0);
        valorTotal = totalNotas + totalConsumos;

        // Gráfico mensal pelo valor oficial
        const dadosAgrupados = new Map<string, number>();
        notasOficiaisFiltradas.forEach(n => {
          const mesPeriodo = format(parseISO(n.data), 'MMM/yyyy', { locale: pt });
          dadosAgrupados.set(mesPeriodo, (dadosAgrupados.get(mesPeriodo) || 0) + n.valor);
        });
        dadosFiltrados.filter(d => d.tipo === "Consumo").forEach(item => {
          const mesPeriodo = format(parseISO(item.data), 'MMM/yyyy', { locale: pt });
          dadosAgrupados.set(mesPeriodo, (dadosAgrupados.get(mesPeriodo) || 0) + item.valor);
        });

        const coresMeses = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#84cc16', '#f97316'];
        dadosGraficoArray = Array.from(dadosAgrupados.entries())
          .map(([periodo, valor], index) => ({ periodo, valor, cor: coresMeses[index % coresMeses.length] }))
          .sort((a, b) => new Date(a.periodo).getTime() - new Date(b.periodo).getTime());
      } else {
        // Modo filtrado: soma item-a-item respeita os filtros aplicados.
        valorTotal = dadosFiltrados.reduce((sum, item) => sum + item.valor, 0);

        const dadosAgrupados = new Map<string, number>();
        dadosFiltrados.forEach(item => {
          const mesPeriodo = format(parseISO(item.data), 'MMM/yyyy', { locale: pt });
          dadosAgrupados.set(mesPeriodo, (dadosAgrupados.get(mesPeriodo) || 0) + item.valor);
        });

        const coresMeses = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#84cc16', '#f97316'];
        dadosGraficoArray = Array.from(dadosAgrupados.entries())
          .map(([periodo, valor], index) => ({ periodo, valor, cor: coresMeses[index % coresMeses.length] }))
          .sort((a, b) => new Date(a.periodo).getTime() - new Date(b.periodo).getTime());
      }

      const quantidadeTotal = dadosFiltrados.reduce((sum, item) => sum + item.quantidade, 0);

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
      <PageHeader title="Relatórios" />

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
                <Combobox
                  value={produto}
                  onValueChange={setProduto}
                  options={[
                    { value: "", label: "Todos os produtos" },
                    ...produtos.map(prod => ({ value: prod, label: prod }))
                  ]}
                  placeholder="Selecione um produto..."
                  searchPlaceholder="Buscar produto..."
                  emptyText="Nenhum produto encontrado."
                />
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
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={dadosGrafico}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="periodo" />
                        <YAxis />
                        <Tooltip 
                          formatter={(value: number) => [`R$ ${value.toFixed(2)}`, 'Valor']}
                          labelFormatter={(label) => `Período: ${label}`}
                        />
                        <Bar dataKey="valor">
                          {dadosGrafico.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.cor} />
                          ))}
                        </Bar>
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