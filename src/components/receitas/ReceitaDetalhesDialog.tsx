import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { Clock, Users, ShoppingCart, Youtube } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

interface ReceitaDetalhesDialogProps {
  receitaId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ReceitaDetalhesDialog({ receitaId, open, onOpenChange }: ReceitaDetalhesDialogProps) {
  const { data: receita, isLoading: loadingReceita } = useQuery({
    queryKey: ["receita", receitaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("receitas")
        .select("*")
        .eq("id", receitaId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  const { data: disponibilidade, isLoading: loadingDisp } = useQuery({
    queryKey: ["receita-disponibilidade", receitaId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("verificar_disponibilidade_receita", {
        receita_uuid: receitaId
      });
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  const isLoading = loadingReceita || loadingDisp;

  const handleCriarLista = async () => {
    try {
      const { data, error } = await supabase.rpc("criar_lista_compras_de_receita", {
        receita_uuid: receitaId
      });
      if (error) throw error;
      toast.success("Lista de compras criada!");
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || "Erro ao criar lista");
    }
  };

  if (isLoading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <Skeleton className="h-64" />
        </DialogContent>
      </Dialog>
    );
  }

  const ingredientesDisponiveis = disponibilidade?.filter((i: any) => i.disponivel).length || 0;
  const ingredientesTotais = disponibilidade?.length || 0;
  const status = ingredientesDisponiveis === ingredientesTotais ? 'completo' : 
                 ingredientesDisponiveis > 0 ? 'parcial' : 'faltando';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {receita?.titulo}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {receita?.imagem_url && (
            <img 
              src={receita.imagem_url} 
              alt={receita.titulo}
              className="w-full h-48 object-cover rounded-lg"
            />
          )}

          {receita?.descricao && (
            <p className="text-sm text-muted-foreground">{receita.descricao}</p>
          )}

          <div className="flex flex-wrap gap-2">
            {receita?.tempo_preparo && (
              <Badge variant="outline">
                <Clock className="h-3 w-3 mr-1" />
                {receita.tempo_preparo} min
              </Badge>
            )}
            {receita?.porcoes && (
              <Badge variant="outline">
                <Users className="h-3 w-3 mr-1" />
                {receita.porcoes} porções
              </Badge>
            )}
            {(receita as any)?.area && (
              <Badge variant="secondary">
                🌍 {(receita as any).area}
              </Badge>
            )}
            {(receita as any)?.categoria && (
              <Badge variant="outline">
                {(receita as any).categoria}
              </Badge>
            )}
          </div>

          <Separator />

          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-semibold">Ingredientes</h4>
              <Badge 
                variant={status === 'completo' ? 'default' : status === 'parcial' ? 'secondary' : 'destructive'}
              >
                {ingredientesDisponiveis}/{ingredientesTotais} disponíveis
              </Badge>
            </div>
            <div className="space-y-2">
              {disponibilidade && Array.isArray(disponibilidade) && 
                disponibilidade.map((ing: any, idx: number) => (
                  <div
                    key={idx}
                    className={`flex items-center justify-between p-3 rounded-md border ${
                      ing.disponivel
                        ? "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800"
                        : "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {ing.quantidade_necessaria} - {ing.ingrediente_nome}
                      </span>
                      {ing.disponivel && ing.quantidade_estoque > 0 && (
                        <span className="text-xs text-muted-foreground">
                          (estoque: {ing.quantidade_estoque})
                        </span>
                      )}
                    </div>
                    <span className="text-xs font-semibold">
                      {ing.disponivel ? "✓ Disponível" : "✗ Faltando"}
                    </span>
                  </div>
                ))}
            </div>
          </div>

          {(receita as any)?.modo_preparo && (
            <>
              <Separator />
              <div>
                <h4 className="font-semibold mb-2">Modo de Preparo</h4>
                <div className="text-sm whitespace-pre-line bg-muted/30 p-4 rounded-lg">
                  {(receita as any).modo_preparo}
                </div>
              </div>
            </>
          )}

          <div className="flex gap-2">
            {status === 'parcial' && (
              <Button onClick={handleCriarLista} className="flex-1">
                <ShoppingCart className="h-4 w-4 mr-2" />
                Criar Lista de Compras
              </Button>
            )}
            {(receita as any)?.video_url && (
              <Button 
                variant="outline"
                onClick={() => window.open((receita as any).video_url, '_blank')}
                className="flex-1"
              >
                <Youtube className="h-4 w-4 mr-2" />
                Ver Vídeo
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
