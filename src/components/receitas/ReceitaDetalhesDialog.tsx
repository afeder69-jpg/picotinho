import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { Clock, Users, ShoppingCart, Star } from "lucide-react";
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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      const { data, error } = await supabase.rpc("verificar_disponibilidade_receita", {
        p_receita_id: receitaId,
        p_user_id: user.id,
      });
      if (error) throw error;
      return data?.[0];
    },
    enabled: open,
  });

  const isLoading = loadingReceita || loadingDisp;

  const handleCriarLista = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      const { error } = await supabase.rpc("criar_lista_compras_de_receita", {
        p_receita_id: receitaId,
        p_user_id: user.id,
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {receita?.titulo}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
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
          </div>

          <Separator />

          <div>
            <h4 className="font-semibold mb-2">Ingredientes</h4>
            <div className="space-y-2">
              {disponibilidade?.ingredientes && Array.isArray(disponibilidade.ingredientes) && 
                disponibilidade.ingredientes.map((ing: any, idx: number) => (
                  <div
                    key={idx}
                    className={`flex items-center justify-between p-2 rounded-md ${
                      ing.tem_estoque
                        ? "bg-green-500/10 text-green-700"
                        : "bg-red-500/10 text-red-700"
                    }`}
                  >
                    <span className="text-sm">
                      {ing.quantidade} {ing.unidade_medida} - {ing.ingrediente}
                    </span>
                    <span className="text-xs">
                      {ing.tem_estoque ? "✓ Disponível" : "✗ Faltando"}
                    </span>
                  </div>
                ))}
            </div>
          </div>

          {receita?.instrucoes && (
            <>
              <Separator />
              <div>
                <h4 className="font-semibold mb-2">Modo de Preparo</h4>
                <div className="text-sm whitespace-pre-line">
                  {receita.instrucoes}
                </div>
              </div>
            </>
          )}

          {disponibilidade?.disponibilidade === 'parcial' && (
            <Button onClick={handleCriarLista} className="w-full">
              <ShoppingCart className="h-4 w-4 mr-2" />
              Criar Lista de Compras
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
