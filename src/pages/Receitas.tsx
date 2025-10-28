import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Plus, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ReceitaCard } from "@/components/receitas/ReceitaCard";
import { ReceitaDialog } from "@/components/receitas/ReceitaDialog";

export default function Receitas() {
  const [busca, setBusca] = useState("");
  const [dialogAberto, setDialogAberto] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: minhasReceitas = [], isLoading: loadingMinhas, refetch: refetchMinhas } = useQuery({
    queryKey: ['minhas-receitas', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('receitas')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user
  });

  const { data: receitasPublicas = [], isLoading: loadingPublicas, refetch: refetchPublicas } = useQuery({
    queryKey: ['receitas-publicas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('receitas')
        .select('*')
        .eq('publica', true)
        .order('media_estrelas', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    }
  });

  const handleReceitaClick = (id: string) => {
    navigate(`/receita/${id}`);
  };

  const handleSuccess = () => {
    refetchMinhas();
    refetchPublicas();
  };

  const filtrarReceitas = (receitas: any[]) => {
    if (!busca) return receitas;
    return receitas.filter(r => 
      r.titulo.toLowerCase().includes(busca.toLowerCase()) ||
      r.instrucoes?.toLowerCase().includes(busca.toLowerCase())
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <PageHeader title="Receitas">
        <Button onClick={() => setDialogAberto(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Nova Receita
        </Button>
      </PageHeader>
      <div className="container max-w-6xl mx-auto p-4 space-y-6 pb-24">

        {/* Busca */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar receitas..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Tabs */}
        <Tabs defaultValue="publicas" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="publicas">Receitas Públicas</TabsTrigger>
            <TabsTrigger value="minhas">Minhas Receitas</TabsTrigger>
          </TabsList>

          <TabsContent value="publicas" className="mt-6">
            {loadingPublicas ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-64 bg-muted animate-pulse rounded-lg" />
                ))}
              </div>
            ) : filtrarReceitas(receitasPublicas).length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                Nenhuma receita pública encontrada
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filtrarReceitas(receitasPublicas).map(receita => (
                  <ReceitaCard 
                    key={receita.id} 
                    receita={receita} 
                    modoVisualizacao="publicas"
                    onClick={() => handleReceitaClick(receita.id)}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="minhas" className="mt-6">
            {loadingMinhas ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-64 bg-muted animate-pulse rounded-lg" />
                ))}
              </div>
            ) : filtrarReceitas(minhasReceitas).length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                Você ainda não criou nenhuma receita
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filtrarReceitas(minhasReceitas).map(receita => (
                  <ReceitaCard 
                    key={receita.id} 
                    receita={receita}
                    modoVisualizacao="minhas"
                    onClick={() => handleReceitaClick(receita.id)}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        <ReceitaDialog 
          open={dialogAberto} 
          onOpenChange={setDialogAberto}
          onSuccess={handleSuccess}
        />
      </div>
    </div>
  );
}
