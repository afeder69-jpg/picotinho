import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChefHat, Clock, Users, Edit, ArrowLeft, Star } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import PicotinhoLogo from "@/components/PicotinhoLogo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { AvaliacaoEstrelas } from "@/components/receitas/AvaliacaoEstrelas";
import { ReceitaDialog } from "@/components/receitas/ReceitaDialog";
import { AvaliacaoReceitaDialog } from "@/components/receitas/AvaliacaoReceitaDialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

// Função para converter URL do YouTube para formato embed
const getYouTubeEmbedUrl = (url: string): string => {
  try {
    const urlObj = new URL(url);
    let videoId = '';
    
    // youtube.com/watch?v=VIDEO_ID
    if (urlObj.hostname.includes('youtube.com') && urlObj.searchParams.has('v')) {
      videoId = urlObj.searchParams.get('v') || '';
    }
    // youtu.be/VIDEO_ID
    else if (urlObj.hostname.includes('youtu.be')) {
      videoId = urlObj.pathname.slice(1);
    }
    // youtube.com/embed/VIDEO_ID (já está correto)
    else if (urlObj.pathname.includes('/embed/')) {
      return url;
    }
    
    if (videoId) {
      return `https://www.youtube.com/embed/${videoId}`;
    }
    
    return url;
  } catch {
    return url;
  }
};

export default function ReceitaDetalhes() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [dialogAberto, setDialogAberto] = useState(false);
  const [avaliacaoDialogOpen, setAvaliacaoDialogOpen] = useState(false);

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

  const { data: avaliacoes = [] } = useQuery({
    queryKey: ['receitas_avaliacoes', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('receitas_avaliacoes')
        .select(`
          *,
          profiles:user_id (nome, nome_completo)
        `)
        .eq('receita_id', id!)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!id && !!receita?.publica
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
                  <Button onClick={() => setDialogAberto(true)}>
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

              <div className="flex items-center gap-4 flex-wrap">
                {(receita.total_avaliacoes || 0) > 0 && (
                  <AvaliacaoEstrelas 
                    media={receita.media_estrelas || 0}
                    total={receita.total_avaliacoes || 0}
                    tamanho="lg"
                  />
                )}
                
                {/* Botão de Avaliar (só aparece para receitas públicas que NÃO são suas) */}
                {receita.publica && !isPropriaReceita && (
                  <Button 
                    onClick={() => setAvaliacaoDialogOpen(true)}
                    variant="outline"
                    className="gap-2"
                  >
                    <Star className="h-4 w-4" />
                    {(receita.total_avaliacoes || 0) > 0 ? 'Avaliar Receita' : 'Seja o primeiro a avaliar'}
                  </Button>
                )}
              </div>
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
                  src={getYouTubeEmbedUrl(receita.video_url)}
                  title={receita.titulo}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="rounded-md"
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Avaliações dos Usuários */}
        {receita.publica && (receita.total_avaliacoes || 0) > 0 && avaliacoes.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Avaliações</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {avaliacoes.map((avaliacao: any) => (
                <div key={avaliacao.id} className="border-b last:border-0 pb-4 last:pb-0">
                  <div className="flex items-start gap-3">
                    <Avatar>
                      <AvatarFallback>
                        {(avaliacao.profiles?.nome || avaliacao.profiles?.nome_completo || 'U')[0].toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <p className="font-medium">
                          {avaliacao.profiles?.nome || avaliacao.profiles?.nome_completo || 'Usuário'}
                        </p>
                        <div className="flex gap-0.5">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star
                              key={i}
                              className={cn(
                                "h-4 w-4",
                                i < avaliacao.estrelas
                                  ? "fill-yellow-400 text-yellow-400"
                                  : "text-gray-300"
                              )}
                            />
                          ))}
                        </div>
                      </div>
                      {avaliacao.comentario && (
                        <p className="text-sm text-muted-foreground">
                          {avaliacao.comentario}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(avaliacao.created_at).toLocaleDateString('pt-BR', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric'
                        })}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Dialog de Edição */}
        <ReceitaDialog
          open={dialogAberto}
          onOpenChange={setDialogAberto}
          receita={receita}
          onSuccess={() => {
            setDialogAberto(false);
            queryClient.invalidateQueries({ queryKey: ['receita', id] });
          }}
        />

        <AvaliacaoReceitaDialog
          open={avaliacaoDialogOpen}
          onOpenChange={setAvaliacaoDialogOpen}
          receitaId={receita?.id || ''}
          receitaTitulo={receita?.titulo || ''}
          onSuccess={() => {
            setAvaliacaoDialogOpen(false);
            queryClient.invalidateQueries({ queryKey: ['receita', id] });
            queryClient.invalidateQueries({ queryKey: ['receitas_avaliacoes', id] });
            toast.success('Avaliação enviada com sucesso!');
          }}
        />
      </div>
    </div>
  );
}
