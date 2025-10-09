import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChefHat, Clock, Users, Edit, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import PicotinhoLogo from "@/components/PicotinhoLogo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { AvaliacaoEstrelas } from "@/components/receitas/AvaliacaoEstrelas";

export default function ReceitaDetalhes() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const { data: receita, isLoading } = useQuery({
    queryKey: ['receita', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('receitas')
        .select('*')
        .eq('id', id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
        <div className="container max-w-4xl mx-auto p-4 space-y-6">
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  if (!receita) {
    return <div>Receita não encontrada</div>;
  }

  const isPropriaReceita = receita.user_id === user?.id;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <div className="container max-w-4xl mx-auto p-4 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <PicotinhoLogo />
          <Button onClick={() => navigate('/receitas')} variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Button>
        </div>

        {/* Imagem e Título */}
        <Card>
          <CardContent className="p-0">
            {receita.imagem_url ? (
              <img 
                src={receita.imagem_url} 
                alt={receita.titulo}
                className="w-full h-64 object-cover rounded-t-lg"
              />
            ) : (
              <div className="w-full h-64 bg-muted flex items-center justify-center rounded-t-lg">
                <ChefHat className="h-24 w-24 text-muted-foreground" />
              </div>
            )}
            <div className="p-6 space-y-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h1 className="text-3xl font-bold">{receita.titulo}</h1>
                  <div className="flex items-center gap-2 mt-2">
                    {isPropriaReceita ? (
                      <Badge variant="default" className="bg-green-500">
                        Minha Receita
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="bg-blue-500 text-white">
                        Receita Pública
                      </Badge>
                    )}
                  </div>
                </div>
                {isPropriaReceita && (
                  <Button>
                    <Edit className="mr-2 h-4 w-4" />
                    Editar
                  </Button>
                )}
              </div>

              <div className="flex items-center gap-6 text-muted-foreground">
                {receita.tempo_preparo && (
                  <div className="flex items-center gap-2">
                    <Clock className="h-5 w-5" />
                    <span>{receita.tempo_preparo} minutos</span>
                  </div>
                )}
                {receita.porcoes && (
                  <div className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    <span>{receita.porcoes} {receita.porcoes === 1 ? 'porção' : 'porções'}</span>
                  </div>
                )}
              </div>

              {(receita.total_avaliacoes || 0) > 0 && (
                <div className="flex items-center gap-4">
                  <AvaliacaoEstrelas 
                    media={receita.media_estrelas || 0}
                    total={receita.total_avaliacoes || 0}
                    tamanho="lg"
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Modo de Preparo */}
        <Card>
          <CardHeader>
            <CardTitle>Modo de Preparo</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="whitespace-pre-wrap">{receita.modo_preparo || receita.instrucoes}</div>
          </CardContent>
        </Card>

        {/* Vídeo (se tiver) */}
        {receita.video_url && (
          <Card>
            <CardHeader>
              <CardTitle>Vídeo Tutorial</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="aspect-video">
                <iframe
                  width="100%"
                  height="100%"
                  src={receita.video_url.replace('watch?v=', 'embed/')}
                  title={receita.titulo}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="rounded-md"
                />
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
