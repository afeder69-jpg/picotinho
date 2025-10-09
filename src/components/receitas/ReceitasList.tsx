import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ReceitaCard } from "./ReceitaCard";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle } from "lucide-react";

interface ReceitasListProps {
  filtro: "todas" | "completo" | "parcial" | "favoritas";
  searchTerm: string;
  categoria?: string;
  area?: string;
}

export function ReceitasList({ filtro, searchTerm, categoria, area }: ReceitasListProps) {
  const { data: receitas, isLoading } = useQuery({
    queryKey: ["receitas-brasileiras", filtro, searchTerm, categoria, area],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("buscar_receitas_brasileiras_disponiveis");
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    );
  }

  const receitasFiltradas = receitas?.filter((receita) => {
    // Filtro por disponibilidade
    if (filtro !== "todas" && filtro !== "favoritas") {
      if (receita.disponibilidade !== filtro) return false;
    }
    if (filtro === "favoritas") return true; // TODO: implementar favoritos

    // Filtro por categoria
    if (categoria && receita.categoria !== categoria) return false;

    // Filtro por culinária (tags)
    if (area && !receita.tags?.includes(area)) return false;

    // Filtro por busca
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      const matchTitle = receita.titulo?.toLowerCase().includes(search);
      const matchCategory = receita.categoria?.toLowerCase().includes(search);
      const matchTags = receita.tags?.some(tag => tag.toLowerCase().includes(search));
      return matchTitle || matchCategory || matchTags;
    }

    return true;
  });

  if (!receitasFiltradas || receitasFiltradas.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <AlertCircle className="h-12 w-12 mb-3 opacity-50" />
        <p className="text-center">Nenhuma receita encontrada</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {receitasFiltradas.map((receita) => (
        <ReceitaCard key={receita.receita_id} receita={{
          id: receita.receita_id,
          titulo: receita.titulo,
          descricao: receita.modo_preparo,
          imagem_url: receita.imagem_url,
          categoria: receita.categoria,
          status_disponibilidade: receita.disponibilidade,
          ingredientes_faltantes: receita.total_ingredientes - receita.ingredientes_disponiveis,
          ingredientes_totais: receita.total_ingredientes,
        }} />
      ))}
    </div>
  );
}
