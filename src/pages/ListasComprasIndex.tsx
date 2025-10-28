import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Plus, ShoppingCart, Calendar, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CriarListaDialog } from "@/components/listaCompras/CriarListaDialog";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function ListasComprasIndex() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [criarDialogOpen, setCriarDialogOpen] = useState(false);

  const { data: listas = [], isLoading } = useQuery({
    queryKey: ['listas-compras', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('listas_compras')
        .select('*, listas_compras_itens(count)')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user
  });

  const origemLabel: Record<string, string> = {
    manual: 'Manual',
    receita: 'Receita',
    cardapio: 'Cardápio'
  };

  const origemIcon: Record<string, any> = {
    manual: User,
    receita: ShoppingCart,
    cardapio: Calendar
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex items-center justify-center">
        <div className="text-center">
          <div className="h-16 w-16 bg-muted animate-pulse rounded-full mx-auto mb-4" />
          <p className="text-muted-foreground">Carregando listas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <PageHeader title="🛒 Listas de Compras">
        <Button onClick={() => setCriarDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Nova Lista
        </Button>
      </PageHeader>
      <div className="container max-w-5xl mx-auto p-4 space-y-6 pb-24">

        {/* Grid de Listas */}
        {listas.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <ShoppingCart className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">Nenhuma lista criada</h3>
              <p className="text-muted-foreground mb-4">
                Crie sua primeira lista de compras para começar a economizar!
              </p>
              <Button onClick={() => setCriarDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Criar Lista Manual
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {listas.map((lista: any) => {
              const Icon = origemIcon[lista.origem] || ShoppingCart;
              const totalItens = lista.listas_compras_itens?.[0]?.count || 0;

              return (
                <Card 
                  key={lista.id} 
                  className="cursor-pointer hover:shadow-lg transition-shadow"
                  onClick={() => navigate(`/lista-compras/${lista.id}`)}
                >
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="flex items-center gap-2">
                          <Icon className="h-5 w-5" />
                          {lista.titulo}
                        </CardTitle>
                        <CardDescription>
                          {format(new Date(lista.created_at), "d 'de' MMMM 'de' yyyy", { locale: ptBR })}
                        </CardDescription>
                      </div>
                      <Badge variant="secondary">
                        {origemLabel[lista.origem]}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <ShoppingCart className="h-4 w-4" />
                      <span>{totalItens} produtos</span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <CriarListaDialog 
          open={criarDialogOpen}
          onClose={() => setCriarDialogOpen(false)}
        />
      </div>
    </div>
  );
}