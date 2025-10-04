import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Download, Pause, Play, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const CATEGORIAS_PICOTINHO = [
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
  'PET'
];

export default function ImportarProdutos() {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [categoriasSelecionadas, setCategoriasSelecionadas] = useState<string[]>([]);
  const [limite, setLimite] = useState("50");
  const [apenasComImagem, setApenasComImagem] = useState(true);
  const [importando, setImportando] = useState(false);
  const [pausado, setPausado] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const [estatisticas, setEstatisticas] = useState({
    total: 0,
    importados: 0,
    duplicados: 0,
    erros: 0,
    comImagem: 0,
    semImagem: 0
  });
  const [logs, setLogs] = useState<string[]>([]);

  const toggleCategoria = (categoria: string) => {
    setCategoriasSelecionadas(prev =>
      prev.includes(categoria)
        ? prev.filter(c => c !== categoria)
        : [...prev, categoria]
    );
  };

  const iniciarImportacao = async () => {
    try {
      setImportando(true);
      setPausado(false);
      setProgresso(0);
      setLogs([]);
      setEstatisticas({
        total: 0,
        importados: 0,
        duplicados: 0,
        erros: 0,
        comImagem: 0,
        semImagem: 0
      });

      const { data, error } = await supabase.functions.invoke('importar-open-food-facts', {
        body: {
          categorias: categoriasSelecionadas.length > 0 ? categoriasSelecionadas : undefined,
          limite: parseInt(limite),
          pagina: 1,
          comImagem: apenasComImagem
        }
      });

      if (error) throw error;

      setEstatisticas({
        total: data.total || 0,
        importados: data.importados || 0,
        duplicados: data.duplicados || 0,
        erros: data.erros || 0,
        comImagem: data.comImagem || 0,
        semImagem: data.semImagem || 0
      });

      setLogs(data.logs || []);
      setProgresso(100);

      toast({
        title: "Importação concluída",
        description: `${data.importados} produtos importados com sucesso`
      });

    } catch (error: any) {
      console.error('Erro na importação:', error);
      toast({
        title: "Erro na importação",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setImportando(false);
    }
  };

  const limparLogs = () => {
    setLogs([]);
    setEstatisticas({
      total: 0,
      importados: 0,
      duplicados: 0,
      erros: 0,
      comImagem: 0,
      semImagem: 0
    });
    setProgresso(0);
  };

  return (
    <div className="min-h-screen bg-background p-4 pb-20">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/admin/gerenciar-masters')}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Importar Produtos</h1>
            <p className="text-sm text-muted-foreground">
              Open Food Facts - Base de dados de produtos brasileiros
            </p>
          </div>
        </div>

        {/* Painel de Controle */}
        <Card className="p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Configurações de Importação</h2>
          
          {/* Seletor de Categorias */}
          <div className="mb-4">
            <Label className="mb-2 block">Categorias (deixe vazio para todas)</Label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {CATEGORIAS_PICOTINHO.map(cat => (
                <div key={cat} className="flex items-center space-x-2">
                  <Checkbox
                    id={cat}
                    checked={categoriasSelecionadas.includes(cat)}
                    onCheckedChange={() => toggleCategoria(cat)}
                    disabled={importando}
                  />
                  <Label htmlFor={cat} className="text-sm cursor-pointer">
                    {cat}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          {/* Limite e Filtros */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <Label className="mb-2 block">Limite de produtos</Label>
              <Select value={limite} onValueChange={setLimite} disabled={importando}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="50">50 produtos</SelectItem>
                  <SelectItem value="100">100 produtos</SelectItem>
                  <SelectItem value="500">500 produtos</SelectItem>
                  <SelectItem value="1000">1000 produtos</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center space-x-2 pt-8">
              <Checkbox
                id="comImagem"
                checked={apenasComImagem}
                onCheckedChange={(checked) => setApenasComImagem(checked as boolean)}
                disabled={importando}
              />
              <Label htmlFor="comImagem" className="cursor-pointer">
                Apenas produtos com imagem
              </Label>
            </div>
          </div>

          {/* Botões de Controle */}
          <div className="flex gap-2">
            <Button
              onClick={iniciarImportacao}
              disabled={importando}
              className="flex-1"
            >
              {importando ? (
                <>
                  <Pause className="mr-2 h-4 w-4" />
                  Importando...
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4" />
                  Iniciar Importação
                </>
              )}
            </Button>

            <Button
              variant="outline"
              onClick={limparLogs}
              disabled={importando}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Limpar
            </Button>
          </div>
        </Card>

        {/* Painel de Progresso */}
        {(importando || progresso > 0) && (
          <Card className="p-6 mb-6">
            <div className="mb-4">
              <div className="flex justify-between mb-2">
                <span className="text-sm font-medium">Progresso</span>
                <span className="text-sm text-muted-foreground">{progresso}%</span>
              </div>
              <Progress value={progresso} />
            </div>

            {/* Estatísticas */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="text-center p-4 rounded-lg bg-primary/10">
                <div className="text-2xl font-bold text-primary">{estatisticas.importados}</div>
                <div className="text-xs text-muted-foreground">Importados</div>
              </div>
              
              <div className="text-center p-4 rounded-lg bg-yellow-500/10">
                <div className="text-2xl font-bold text-yellow-600">{estatisticas.duplicados}</div>
                <div className="text-xs text-muted-foreground">Duplicados</div>
              </div>
              
              <div className="text-center p-4 rounded-lg bg-destructive/10">
                <div className="text-2xl font-bold text-destructive">{estatisticas.erros}</div>
                <div className="text-xs text-muted-foreground">Erros</div>
              </div>
              
              <div className="text-center p-4 rounded-lg bg-blue-500/10">
                <div className="text-2xl font-bold text-blue-600">{estatisticas.comImagem}</div>
                <div className="text-xs text-muted-foreground">Com Imagem</div>
              </div>
              
              <div className="text-center p-4 rounded-lg bg-gray-500/10">
                <div className="text-2xl font-bold text-gray-600">{estatisticas.semImagem}</div>
                <div className="text-xs text-muted-foreground">Sem Imagem</div>
              </div>
              
              <div className="text-center p-4 rounded-lg bg-secondary/10">
                <div className="text-2xl font-bold">{estatisticas.total}</div>
                <div className="text-xs text-muted-foreground">Total</div>
              </div>
            </div>
          </Card>
        )}

        {/* Logs */}
        {logs.length > 0 && (
          <Card className="p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Logs de Importação</h2>
              <Button variant="outline" size="sm">
                <Download className="mr-2 h-4 w-4" />
                Exportar CSV
              </Button>
            </div>
            
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {logs.map((log, index) => (
                <div
                  key={index}
                  className={`p-2 rounded text-sm font-mono ${
                    log.startsWith('✅')
                      ? 'bg-primary/10 text-primary'
                      : log.startsWith('⚠️')
                      ? 'bg-yellow-500/10 text-yellow-600'
                      : 'bg-destructive/10 text-destructive'
                  }`}
                >
                  {log}
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
