import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle, XCircle, ArrowRight, Plus, Trash2, Edit, Power } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Mudanca {
  produto_nome: string;
  categoria_anterior: string;
  categoria_nova: string;
  razao: string;
  status: 'sucesso' | 'erro';
}

interface ResultadoRecategorizacao {
  sucesso: boolean;
  produtos_analisados: number;
  produtos_recategorizados: number;
  produtos_mantidos: number;
  mudancas: Mudanca[];
  timestamp: string;
}

interface Regra {
  id: string;
  keywords: string[];
  categorias_origem: string[] | null;
  categoria_destino: string;
  descricao: string;
  ativa: boolean;
}

const CATEGORIAS = [
  'AÇOUGUE',
  'BEBIDAS',
  'CONGELADOS',
  'HIGIENE/FARMÁCIA',
  'HORTIFRUTI',
  'LATICÍNIOS/FRIOS',
  'LIMPEZA',
  'MERCEARIA',
  'OUTROS',
  'PADARIA',
  'PET',
];

const RecategorizarProdutosInteligente = () => {
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState<ResultadoRecategorizacao | null>(null);
  const [regras, setRegras] = useState<Regra[]>([]);
  const [loadingRegras, setLoadingRegras] = useState(false);
  const [editandoRegra, setEditandoRegra] = useState<Regra | null>(null);
  const [novaRegra, setNovaRegra] = useState({
    keywords: '',
    categorias_origem: [] as string[],
    categoria_destino: '',
    descricao: '',
  });
  const [dialogAberto, setDialogAberto] = useState(false);
  const { toast } = useToast();

  const carregarRegras = async () => {
    try {
      setLoadingRegras(true);
      const { data, error } = await supabase
        .from('regras_recategorizacao')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRegras(data || []);
    } catch (error) {
      console.error('Erro ao carregar regras:', error);
      toast({
        title: "Erro ao carregar regras",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoadingRegras(false);
    }
  };

  const executarRecategorizacao = async () => {
    try {
      setLoading(true);
      setResultado(null);

      const { data, error } = await supabase.functions.invoke(
        "recategorizar-produtos-inteligente",
        { body: {} }
      );

      if (error) throw error;

      setResultado(data);
      toast({
        title: "Recategorização concluída!",
        description: `${data.produtos_recategorizados} produtos foram recategorizados de ${data.produtos_analisados} analisados.`,
      });
    } catch (error) {
      console.error("Erro na recategorização:", error);
      toast({
        title: "Erro na recategorização",
        description: error.message || "Ocorreu um erro ao recategorizar os produtos.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const salvarRegra = async () => {
    try {
      if (!novaRegra.keywords || !novaRegra.categoria_destino || !novaRegra.descricao) {
        toast({
          title: "Campos obrigatórios",
          description: "Preencha palavras-chave, categoria destino e descrição.",
          variant: "destructive",
        });
        return;
      }

      const keywords = novaRegra.keywords.split(',').map(k => k.trim()).filter(k => k);
      
      if (editandoRegra) {
        const { error } = await supabase
          .from('regras_recategorizacao')
          .update({
            keywords,
            categorias_origem: novaRegra.categorias_origem.length > 0 ? novaRegra.categorias_origem : null,
            categoria_destino: novaRegra.categoria_destino,
            descricao: novaRegra.descricao,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editandoRegra.id);

        if (error) throw error;
        
        toast({
          title: "Regra atualizada!",
          description: "A regra foi atualizada com sucesso.",
        });
      } else {
        const { error } = await supabase
          .from('regras_recategorizacao')
          .insert({
            keywords,
            categorias_origem: novaRegra.categorias_origem.length > 0 ? novaRegra.categorias_origem : null,
            categoria_destino: novaRegra.categoria_destino,
            descricao: novaRegra.descricao,
            ativa: true,
          });

        if (error) throw error;
        
        toast({
          title: "Regra criada!",
          description: "A regra foi criada com sucesso.",
        });
      }

      setNovaRegra({ keywords: '', categorias_origem: [], categoria_destino: '', descricao: '' });
      setEditandoRegra(null);
      setDialogAberto(false);
      carregarRegras();
    } catch (error) {
      console.error('Erro ao salvar regra:', error);
      toast({
        title: "Erro ao salvar regra",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const toggleAtiva = async (regra: Regra) => {
    try {
      const { error } = await supabase
        .from('regras_recategorizacao')
        .update({ ativa: !regra.ativa, updated_at: new Date().toISOString() })
        .eq('id', regra.id);

      if (error) throw error;
      
      toast({
        title: regra.ativa ? "Regra desativada" : "Regra ativada",
        description: `A regra foi ${regra.ativa ? 'desativada' : 'ativada'} com sucesso.`,
      });
      
      carregarRegras();
    } catch (error) {
      console.error('Erro ao atualizar regra:', error);
      toast({
        title: "Erro ao atualizar regra",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const deletarRegra = async (id: string) => {
    try {
      const { error } = await supabase
        .from('regras_recategorizacao')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      toast({
        title: "Regra deletada",
        description: "A regra foi deletada com sucesso.",
      });
      
      carregarRegras();
    } catch (error) {
      console.error('Erro ao deletar regra:', error);
      toast({
        title: "Erro ao deletar regra",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const abrirEdicao = (regra: Regra) => {
    setEditandoRegra(regra);
    setNovaRegra({
      keywords: regra.keywords.join(', '),
      categorias_origem: regra.categorias_origem || [],
      categoria_destino: regra.categoria_destino,
      descricao: regra.descricao,
    });
    setDialogAberto(true);
  };

  const abrirNova = () => {
    setEditandoRegra(null);
    setNovaRegra({ keywords: '', categorias_origem: [], categoria_destino: '', descricao: '' });
    setDialogAberto(true);
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <PageHeader title="Recategorização Inteligente" />
      
      <div className="container mx-auto p-4 space-y-6">
        <Tabs defaultValue="executar" onValueChange={(v) => v === 'gerenciar' && carregarRegras()}>
          <TabsList className="w-full grid grid-cols-2">
            <TabsTrigger value="executar">Executar Recategorização</TabsTrigger>
            <TabsTrigger value="gerenciar">Gerenciar Regras</TabsTrigger>
          </TabsList>

          <TabsContent value="executar" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Recategorização Automática de Produtos</CardTitle>
                <CardDescription>
                  Esta ferramenta corrige automaticamente as categorias de produtos baseado em regras configuradas
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button 
                  onClick={executarRecategorizacao} 
                  disabled={loading}
                  className="w-full"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Recategorizando...
                    </>
                  ) : (
                    "Executar Recategorização Inteligente"
                  )}
                </Button>
              </CardContent>
            </Card>

            {resultado && (
              <Card>
                <CardHeader>
                  <CardTitle>Resultado da Recategorização</CardTitle>
                  <CardDescription>
                    Executado em {new Date(resultado.timestamp).toLocaleString('pt-BR')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <Card>
                      <CardContent className="pt-6">
                        <div className="text-center">
                          <p className="text-2xl font-bold text-primary">{resultado.produtos_analisados}</p>
                          <p className="text-sm text-muted-foreground">Analisados</p>
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-6">
                        <div className="text-center">
                          <p className="text-2xl font-bold text-green-600">{resultado.produtos_recategorizados}</p>
                          <p className="text-sm text-muted-foreground">Recategorizados</p>
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-6">
                        <div className="text-center">
                          <p className="text-2xl font-bold text-muted-foreground">{resultado.produtos_mantidos}</p>
                          <p className="text-sm text-muted-foreground">Mantidos</p>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {resultado.mudancas && resultado.mudancas.length > 0 && (
                    <div>
                      <h3 className="font-semibold mb-3">Mudanças Realizadas:</h3>
                      <div className="border rounded-lg">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Produto</TableHead>
                              <TableHead>Categoria Anterior</TableHead>
                              <TableHead className="w-12"></TableHead>
                              <TableHead>Categoria Nova</TableHead>
                              <TableHead>Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {resultado.mudancas.map((mudanca, index) => (
                              <TableRow key={index}>
                                <TableCell className="font-medium">{mudanca.produto_nome}</TableCell>
                                <TableCell>
                                  <Badge variant="outline">{mudanca.categoria_anterior}</Badge>
                                </TableCell>
                                <TableCell>
                                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                                </TableCell>
                                <TableCell>
                                  <Badge variant="default">{mudanca.categoria_nova}</Badge>
                                </TableCell>
                                <TableCell>
                                  {mudanca.status === 'sucesso' ? (
                                    <CheckCircle className="h-4 w-4 text-green-600" />
                                  ) : (
                                    <XCircle className="h-4 w-4 text-red-600" />
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )}

                  {resultado.mudancas && resultado.mudancas.length === 0 && (
                    <Card className="bg-muted">
                      <CardContent className="pt-6">
                        <p className="text-center text-muted-foreground">
                          Nenhum produto precisou ser recategorizado. Todas as categorias já estão corretas! ✅
                        </p>
                      </CardContent>
                    </Card>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="gerenciar" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle>Regras de Recategorização</CardTitle>
                    <CardDescription>
                      Gerencie as regras para recategorização automática de produtos
                    </CardDescription>
                  </div>
                  <Button onClick={abrirNova}>
                    <Plus className="h-4 w-4 mr-2" />
                    Nova Regra
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {loadingRegras ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : regras.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Nenhuma regra cadastrada. Clique em "Nova Regra" para começar.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {regras.map((regra) => (
                      <Card key={regra.id} className={!regra.ativa ? 'opacity-60' : ''}>
                        <CardContent className="pt-6">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 space-y-2">
                              <div className="flex items-center gap-2">
                                <Badge variant="default">{regra.categoria_destino}</Badge>
                                <Badge variant={regra.ativa ? "default" : "secondary"}>
                                  {regra.ativa ? "Ativa" : "Inativa"}
                                </Badge>
                              </div>
                              <p className="text-sm text-muted-foreground">{regra.descricao}</p>
                              <div className="flex flex-wrap gap-1">
                                {regra.keywords.map((kw, i) => (
                                  <Badge key={i} variant="outline" className="text-xs">
                                    {kw}
                                  </Badge>
                                ))}
                              </div>
                              {regra.categorias_origem && regra.categorias_origem.length > 0 && (
                                <p className="text-xs text-muted-foreground">
                                  De: {regra.categorias_origem.join(', ')}
                                </p>
                              )}
                            </div>
                            <div className="flex gap-2">
                              <Button
                                size="icon"
                                variant="outline"
                                onClick={() => toggleAtiva(regra)}
                                title={regra.ativa ? "Desativar" : "Ativar"}
                              >
                                <Power className={`h-4 w-4 ${regra.ativa ? 'text-green-600' : ''}`} />
                              </Button>
                              <Button
                                size="icon"
                                variant="outline"
                                onClick={() => abrirEdicao(regra)}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="outline"
                                onClick={() => {
                                  if (confirm('Tem certeza que deseja deletar esta regra?')) {
                                    deletarRegra(regra.id);
                                  }
                                }}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editandoRegra ? 'Editar Regra' : 'Nova Regra'}
              </DialogTitle>
              <DialogDescription>
                Configure as palavras-chave e categorias para a recategorização automática
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <Label htmlFor="keywords">Palavras-chave (separadas por vírgula)</Label>
                <Input
                  id="keywords"
                  placeholder="Ex: leite condensado, condensado"
                  value={novaRegra.keywords}
                  onChange={(e) => setNovaRegra({ ...novaRegra, keywords: e.target.value })}
                />
              </div>

              <div>
                <Label>Categorias de Origem (opcional)</Label>
                <p className="text-sm text-muted-foreground mb-2">
                  Se especificado, só recategoriza produtos destas categorias
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {CATEGORIAS.map((cat) => (
                    <div key={cat} className="flex items-center space-x-2">
                      <Checkbox
                        id={cat}
                        checked={novaRegra.categorias_origem.includes(cat)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setNovaRegra({
                              ...novaRegra,
                              categorias_origem: [...novaRegra.categorias_origem, cat],
                            });
                          } else {
                            setNovaRegra({
                              ...novaRegra,
                              categorias_origem: novaRegra.categorias_origem.filter((c) => c !== cat),
                            });
                          }
                        }}
                      />
                      <Label htmlFor={cat} className="text-sm font-normal cursor-pointer">
                        {cat}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <Label htmlFor="categoria_destino">Categoria de Destino</Label>
                <Select
                  value={novaRegra.categoria_destino}
                  onValueChange={(value) => setNovaRegra({ ...novaRegra, categoria_destino: value })}
                >
                  <SelectTrigger id="categoria_destino">
                    <SelectValue placeholder="Selecione a categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIAS.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="descricao">Descrição</Label>
                <Input
                  id="descricao"
                  placeholder="Ex: Leite condensado deve ser mercearia"
                  value={novaRegra.descricao}
                  onChange={(e) => setNovaRegra({ ...novaRegra, descricao: e.target.value })}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogAberto(false)}>
                Cancelar
              </Button>
              <Button onClick={salvarRegra}>
                {editandoRegra ? 'Atualizar' : 'Criar'} Regra
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default RecategorizarProdutosInteligente;
