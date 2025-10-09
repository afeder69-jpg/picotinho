import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface CardapioReceitasGridProps {
  cardapioId: string;
}

const diasSemana = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
];

const refeicoes = [
  { value: "cafe_manha", label: "Café" },
  { value: "almoco", label: "Almoço" },
  { value: "jantar", label: "Jantar" },
  { value: "lanche", label: "Lanche" },
];

export function CardapioReceitasGrid({ cardapioId }: CardapioReceitasGridProps) {
  const queryClient = useQueryClient();

  const { data: receitas, isLoading } = useQuery({
    queryKey: ["cardapio-receitas", cardapioId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cardapio_receitas")
        .select(`
          *,
          receitas (
            id,
            titulo,
            categoria
          )
        `)
        .eq("cardapio_id", cardapioId);

      if (error) throw error;
      return data;
    },
  });

  const handleRemove = async (id: string) => {
    try {
      const { error } = await supabase
        .from("cardapio_receitas")
        .delete()
        .eq("id", id);

      if (error) throw error;

      toast.success("Receita removida do cardápio");
      queryClient.invalidateQueries({ queryKey: ["cardapio-receitas"] });
    } catch (error: any) {
      toast.error(error.message || "Erro ao remover receita");
    }
  };

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Carregando...</div>;
  }

  if (!receitas || receitas.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        Nenhuma receita adicionada ainda
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-7 gap-2 text-xs font-medium text-muted-foreground">
        {diasSemana.map((dia) => (
          <div key={dia} className="text-center">
            {dia}
          </div>
        ))}
      </div>

      {refeicoes.map((refeicao) => (
        <div key={refeicao.value} className="space-y-2">
          <div className="text-sm font-medium">{refeicao.label}</div>
          <div className="grid grid-cols-7 gap-2">
            {diasSemana.map((_, diaIndex) => {
              const receitaDoDia = receitas.find(
                (r) =>
                  r.dia_semana === diaIndex && r.refeicao === refeicao.value
              );

              return (
                <div
                  key={diaIndex}
                  className="min-h-[60px] p-2 rounded-md border bg-card text-card-foreground"
                >
                  {receitaDoDia && receitaDoDia.receitas && (
                    <div className="space-y-1">
                      <div className="flex items-start justify-between gap-1">
                        <span className="text-xs font-medium line-clamp-2">
                          {receitaDoDia.receitas.titulo}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 shrink-0"
                          onClick={() => handleRemove(receitaDoDia.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                      <Badge variant="secondary" className="text-[10px] px-1">
                        {receitaDoDia.receitas.categoria}
                      </Badge>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
