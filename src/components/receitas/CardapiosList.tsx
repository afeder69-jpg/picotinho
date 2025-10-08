import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CardapioCard } from "./CardapioCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar } from "lucide-react";

export function CardapiosList() {
  const { data: cardapios, isLoading } = useQuery({
    queryKey: ["cardapios"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      const { data, error } = await supabase
        .from("cardapios")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2].map((i) => (
          <Skeleton key={i} className="h-40 w-full" />
        ))}
      </div>
    );
  }

  if (!cardapios || cardapios.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Calendar className="h-12 w-12 mb-3 opacity-50" />
        <p className="text-center">Nenhum cardápio criado ainda</p>
        <p className="text-sm text-center mt-1">Crie seu primeiro cardápio semanal!</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {cardapios.map((cardapio) => (
        <CardapioCard key={cardapio.id} cardapio={cardapio} />
      ))}
    </div>
  );
}
