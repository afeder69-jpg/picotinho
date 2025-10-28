import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Plus, Calendar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { CardapioCard } from "@/components/cardapio/CardapioCard";
import { CardapioDialog } from "@/components/cardapio/CardapioDialog";

export default function Cardapios() {
  const [dialogAberto, setDialogAberto] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: cardapios = [], isLoading, refetch } = useQuery({
    queryKey: ['cardapios', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('cardapios')
        .select(`
          *,
          cardapio_receitas(count)
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user
  });

  const handleCardapioClick = (id: string) => {
    navigate(`/cardapio/${id}`);
  };

  const handleSuccess = () => {
    refetch();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <PageHeader title="Cardápios">
        <Button onClick={() => setDialogAberto(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Novo Cardápio
        </Button>
      </PageHeader>
      <div className="container max-w-6xl mx-auto p-4 space-y-6 pb-24">

        {/* Lista de Cardápios */}
        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-48 bg-muted animate-pulse rounded-lg" />
            ))}
          </div>
        ) : cardapios.length === 0 ? (
          <div className="text-center py-12 space-y-4">
            <Calendar className="h-16 w-16 mx-auto text-muted-foreground" />
            <div>
              <h3 className="text-lg font-medium">Nenhum cardápio criado</h3>
              <p className="text-sm text-muted-foreground mt-2">
                Crie seu primeiro cardápio para organizar suas refeições da semana
              </p>
            </div>
            <Button onClick={() => setDialogAberto(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Criar Primeiro Cardápio
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {cardapios.map(cardapio => (
              <CardapioCard 
                key={cardapio.id} 
                cardapio={cardapio}
                onClick={() => handleCardapioClick(cardapio.id)}
                onSuccess={handleSuccess}
              />
            ))}
          </div>
        )}

        <CardapioDialog 
          open={dialogAberto} 
          onOpenChange={setDialogAberto}
          onSuccess={handleSuccess}
        />
      </div>
    </div>
  );
}
