import { useState } from "react";
import { Dice5 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

export function ReceitaAleatoria() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [receita, setReceita] = useState<any>(null);
  const queryClient = useQueryClient();

  const buscarAleatoria = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('buscar-receitas-api', {
        body: { mode: 'random', api: 'themealdb' }
      });

      if (error) throw error;

      if (data.receitas && data.receitas.length > 0) {
        setReceita(data.receitas[0]);
        setOpen(true);
      } else {
        toast.error('Nenhuma receita aleatória encontrada');
      }
    } catch (error) {
      console.error('Erro ao buscar receita aleatória:', error);
      toast.error('Erro ao buscar receita aleatória');
    } finally {
      setLoading(false);
    }
  };

  const importarReceita = async () => {
    if (!receita) return;

    setLoading(true);
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('Usuário não autenticado');

      const receitaParaImportar = {
        id: receita.id,
        titulo: receita.titulo,
        descricao: receita.descricao,
        imagem_url: receita.imagem_url,
        categoria: receita.categoria,
        area: receita.area,
        video_url: receita.video_url,
        modo_preparo: receita.descricao,
        ingredientes: receita.ingredientes,
        api_source: 'themealdb'
      };

      const { error } = await supabase.functions.invoke('importar-receita-api', {
        body: receitaParaImportar
      });

      if (error) throw error;

      toast.success('Receita importada com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['receitas-disponiveis'] });
      setOpen(false);
    } catch (error: any) {
      console.error('Erro ao importar:', error);
      toast.error(error.message || 'Erro ao importar receita');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={buscarAleatoria}
        disabled={loading}
        className="gap-2"
      >
        <Dice5 className="h-4 w-4" />
        Receita Aleatória
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>🎲 Receita Aleatória do Dia</DialogTitle>
          </DialogHeader>

          {receita && (
            <div className="space-y-4">
              {receita.imagem_url && (
                <img 
                  src={receita.imagem_url} 
                  alt={receita.titulo}
                  className="w-full h-64 object-cover rounded-lg"
                />
              )}

              <div>
                <h3 className="text-xl font-bold">{receita.titulo}</h3>
                <div className="flex gap-2 mt-2">
                  {receita.categoria && (
                    <span className="text-xs px-2 py-1 bg-primary/10 rounded">
                      {receita.categoria}
                    </span>
                  )}
                  {receita.area && (
                    <span className="text-xs px-2 py-1 bg-secondary/10 rounded">
                      🌍 {receita.area}
                    </span>
                  )}
                </div>
              </div>

              {receita.ingredientes && receita.ingredientes.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-2">Ingredientes ({receita.ingredientes.length})</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {receita.ingredientes.slice(0, 6).map((ing: any, i: number) => (
                      <div key={i} className="text-sm flex items-center gap-2">
                        {ing.imagem_url && (
                          <img src={ing.imagem_url} alt={ing.nome} className="w-6 h-6 object-contain" />
                        )}
                        <span>{ing.nome}</span>
                      </div>
                    ))}
                    {receita.ingredientes.length > 6 && (
                      <span className="text-xs text-muted-foreground">
                        +{receita.ingredientes.length - 6} mais
                      </span>
                    )}
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <Button 
                  onClick={importarReceita} 
                  disabled={loading}
                  className="flex-1"
                >
                  Importar Receita
                </Button>
                {receita.video_url && (
                  <Button 
                    variant="outline" 
                    onClick={() => window.open(receita.video_url, '_blank')}
                  >
                    Ver Vídeo
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
