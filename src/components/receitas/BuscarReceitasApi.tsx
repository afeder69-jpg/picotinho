import { useState } from "react";
import { Search, Download } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

interface BuscarReceitasApiProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BuscarReceitasApi({ open, onOpenChange }: BuscarReceitasApiProps) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);
  const [receitas, setReceitas] = useState<any[]>([]);
  const queryClient = useQueryClient();

  const handleBuscar = async () => {
    if (!query.trim()) {
      toast.error("Digite algo para buscar");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('buscar-receitas-api', {
        body: { query, mode: 'search', maxResults: 10 }
      });

      if (error) throw error;

      setReceitas(data.receitas || []);
      
      if (data.receitas.length === 0) {
        toast.info("Nenhuma receita encontrada");
      } else {
        toast.success(`${data.receitas.length} receitas brasileiras encontradas!`);
      }
    } catch (error: any) {
      console.error('Erro ao buscar:', error);
      toast.error(error.message || "Erro ao buscar receitas");
    } finally {
      setLoading(false);
    }
  };

  const handleImportar = async (receita: any) => {
    setImporting(receita.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const receitaParaImportar = {
        id: receita.id,
        titulo: receita.titulo,
        descricao: receita.descricao,
        modo_preparo: receita.modo_preparo,
        imagem_url: receita.imagem_url,
        categoria: receita.categoria,
        tempo_preparo: receita.tempo_preparo,
        porcoes: receita.porcoes,
        ingredientes: receita.ingredientes,
        tags: receita.tags,
        fonte: 'brasileiras'
      };

      const { error } = await supabase.functions.invoke('importar-receita-api', {
        body: receitaParaImportar
      });

      if (error) throw error;

      toast.success("Receita importada com sucesso!");
      queryClient.invalidateQueries({ queryKey: ['receitas-disponiveis'] });
      onOpenChange(false);
    } catch (error: any) {
      console.error('Erro ao importar:', error);
      toast.error(error.message || "Erro ao importar receita");
    } finally {
      setImporting(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>🇧🇷 Buscar Receitas Brasileiras</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Busca */}
          <div className="flex gap-2">
            <Input
              placeholder="Ex: bolo de chocolate, feijoada, moqueca..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleBuscar()}
              className="flex-1"
            />
            
            <Button onClick={handleBuscar} disabled={loading}>
              <Search className="h-4 w-4" />
            </Button>
          </div>

          {/* Resultados */}
          {loading && (
            <div className="text-center py-8 text-muted-foreground">
              Buscando receitas...
            </div>
          )}

          {!loading && receitas.length === 0 && query && (
            <div className="text-center py-8 text-muted-foreground">
              Nenhuma receita encontrada. Tente buscar por outro nome.
            </div>
          )}

          {!loading && receitas.length === 0 && !query && (
            <div className="text-center py-8 text-muted-foreground">
              Digite algo para buscar receitas brasileiras
            </div>
          )}

          <div className="space-y-3">
            {receitas.map((receita) => (
              <Card key={receita.id}>
                <CardContent className="p-4">
                  <div className="flex gap-4">
                    {receita.imagem_url && (
                      <img
                        src={receita.imagem_url}
                        alt={receita.titulo}
                        className="w-24 h-24 object-cover rounded"
                      />
                    )}
                    
                    <div className="flex-1">
                      <h4 className="font-semibold mb-1">{receita.titulo}</h4>
                      {receita.descricao && (
                        <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                          {receita.descricao}
                        </p>
                      )}
                      
                      <div className="flex flex-wrap gap-1 mb-2">
                        {receita.categoria && (
                          <Badge variant="outline" className="text-xs">
                            {receita.categoria}
                          </Badge>
                        )}
                        {receita.ingredientes && (
                          <Badge variant="outline" className="text-xs">
                            {receita.ingredientes.length} ingredientes
                          </Badge>
                        )}
                        {receita.tempo_preparo && (
                          <Badge variant="outline" className="text-xs">
                            ⏱️ {receita.tempo_preparo} min
                          </Badge>
                        )}
                      </div>

                      <Button
                        size="sm"
                        onClick={() => handleImportar(receita)}
                        disabled={importing === receita.id}
                      >
                        <Download className="h-3 w-3 mr-1" />
                        {importing === receita.id ? "Importando..." : "Importar"}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
