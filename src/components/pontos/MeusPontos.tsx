import { useQuery } from "@tanstack/react-query";
import { Trophy, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";

export function MeusPontos() {
  const { user } = useAuth();

  const { data: pontos } = useQuery({
    queryKey: ['meus-pontos', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('usuarios_pontos')
        .select('*')
        .eq('user_id', user!.id)
        .single();
      return data;
    },
    enabled: !!user
  });

  const { data: pontosCategoria } = useQuery({
    queryKey: ['pontos-categoria', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('usuarios_pontos_log')
        .select('categoria, pontos_ganhos')
        .eq('user_id', user!.id);

      // Agrupar por categoria
      const grouped = (data || []).reduce((acc: any, curr) => {
        if (!acc[curr.categoria]) {
          acc[curr.categoria] = 0;
        }
        acc[curr.categoria] += curr.pontos_ganhos;
        return acc;
      }, {});

      return Object.entries(grouped).map(([categoria, pontos]) => ({
        categoria,
        pontos: pontos as number
      }));
    },
    enabled: !!user
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="text-yellow-500" />
          Meus Pontos Picotinho
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <p className="text-sm text-muted-foreground">Pontos Disponíveis</p>
            <p className="text-3xl font-bold text-primary">
              {pontos?.pontos_disponiveis || 0}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Total Ganho</p>
            <p className="text-3xl font-bold text-muted-foreground">
              {pontos?.pontos_totais_ganhos || 0}
            </p>
          </div>
        </div>
        
        <Separator className="my-4" />
        
        {pontosCategoria && pontosCategoria.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-semibold mb-2">Pontos por Atividade:</p>
            {pontosCategoria.map(cat => (
              <div key={cat.categoria} className="flex justify-between text-sm">
                <span className="capitalize">{cat.categoria.replace('_', ' ')}</span>
                <span className="font-medium flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" />
                  {cat.pontos} pts
                </span>
              </div>
            ))}
          </div>
        )}
        
        <Button className="w-full mt-4" variant="outline" disabled>
          Resgatar Prêmios (Em breve)
        </Button>
      </CardContent>
    </Card>
  );
}
