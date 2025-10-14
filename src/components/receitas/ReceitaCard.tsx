import { ChefHat, Clock, Users, ChevronRight, Crown, ShoppingCart } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { AvaliacaoEstrelas } from "./AvaliacaoEstrelas";
import { Database } from "@/integrations/supabase/types";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";

type Receita = Database['public']['Tables']['receitas']['Row'];

interface ReceitaCardProps {
  receita: Receita;
  modoVisualizacao: 'minhas' | 'publicas' | 'todas';
  onClick: () => void;
}

export function ReceitaCard({ receita, modoVisualizacao, onClick }: ReceitaCardProps) {
  const isTopRated = (receita.media_estrelas || 0) >= 4.5 && (receita.total_avaliacoes || 0) >= 10;
  const currentUserId = ''; // Será preenchido via AuthContext quando necessário
  const { user } = useAuth();

  const { data: custoReceita } = useQuery({
    queryKey: ['receita-custo-card', receita.id],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('calcular-custo-receita', {
        body: { receitaId: receita.id }
      });
      if (error) throw error;
      return data as {
        custo_total: number;
        custo_por_porcao: number;
        percentual_disponivel: number;
      };
    },
    enabled: !!user && !!receita.id,
    staleTime: 5 * 60 * 1000, // Cache por 5 minutos
  });

  return (
    <Card 
      className="cursor-pointer hover:shadow-lg transition-shadow"
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex gap-4">
          {/* Miniatura com HoverCard */}
          <HoverCard>
            <HoverCardTrigger asChild>
              <div className="w-20 h-20 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                {receita.imagem_url ? (
                  <img 
                    src={receita.imagem_url} 
                    alt={receita.titulo}
                    className="w-full h-full object-cover rounded-md"
                  />
                ) : (
                  <ChefHat className="h-8 w-8 text-muted-foreground" />
                )}
              </div>
            </HoverCardTrigger>
            {receita.imagem_url && (
              <HoverCardContent className="w-80 p-0">
                <img 
                  src={receita.imagem_url} 
                  alt={receita.titulo}
                  className="w-full h-80 object-cover rounded-md"
                />
              </HoverCardContent>
            )}
          </HoverCard>

          {/* Informações */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold text-lg truncate">{receita.titulo}</h3>
              <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
            </div>

            <div className="flex flex-wrap items-center gap-2 mt-2 text-sm text-muted-foreground">
              {receita.tempo_preparo && (
                <Badge variant="secondary" className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {receita.tempo_preparo}min
                </Badge>
              )}
              {receita.porcoes && (
                <Badge variant="secondary" className="flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {receita.porcoes} {receita.porcoes === 1 ? 'porção' : 'porções'}
                </Badge>
              )}
              
              {user && custoReceita && (
                <>
                  <Badge 
                    variant="outline" 
                    className="flex items-center gap-1 bg-primary/10 text-primary border-primary/20"
                  >
                    R$ {custoReceita.custo_por_porcao.toFixed(2)}/porção
                  </Badge>
                  
                  {custoReceita.percentual_disponivel < 100 && (
                    <Badge 
                      variant={custoReceita.percentual_disponivel >= 50 ? "secondary" : "destructive"}
                      className="flex items-center gap-1"
                    >
                      <ShoppingCart className="h-3 w-3" />
                      {custoReceita.percentual_disponivel.toFixed(0)}%
                    </Badge>
                  )}
                </>
              )}
            </div>

            {/* Avaliações */}
            <div className="mt-3">
              {(receita.total_avaliacoes || 0) > 0 ? (
                <div className="flex items-center gap-2">
                  <AvaliacaoEstrelas 
                    media={receita.media_estrelas || 0}
                    total={receita.total_avaliacoes || 0}
                    tamanho="sm"
                    mostrarNumero={true}
                  />
                  {isTopRated && (
                    <Badge className="bg-yellow-500 text-white">
                      <Crown className="w-3 h-3 mr-1" />
                      Top
                    </Badge>
                  )}
                </div>
              ) : receita.publica ? (
                <Badge variant="secondary" className="text-xs">
                  Seja o primeiro a avaliar
                </Badge>
              ) : null}
            </div>

            {/* Badge de tipo (apenas em "todas") */}
            {modoVisualizacao === 'todas' && (
              <div className="mt-2">
                {receita.user_id === currentUserId ? (
                  <Badge variant="default" className="bg-green-500">
                    Minha Receita
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="bg-blue-500 text-white">
                    Receita Pública
                  </Badge>
                )}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
