import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChefHat, Clock, Users, Edit, ArrowLeft, Star, ShoppingCart, CheckCircle, XCircle } from "lucide-react";
import { toast } from "sonner";
import { cn, formatarUnidadeMedida } from "@/lib/utils";
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

  const { data: ingredientes = [] } = useQuery({
    queryKey: ['receita-ingredientes', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('receita_ingredientes')
        .select('produto_nome_busca, quantidade')
        .eq('receita_id', id!);
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

  const { data: custoReceita, isLoading: loadingCusto } = useQuery({
    queryKey: ['receita-custo', id],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('calcular-custo-receita', {
        body: { receitaId: id }
      });

      if (error) throw error;
      return data as {
        custo_total: number;
        custo_por_porcao: number;
        percentual_disponivel: number;
        ingredientes: Array<{
          nome: string;
          quantidade: string;
          unidade_medida: string;
          disponivel: boolean;
          quantidade_estoque: number;
          preco_unitario: number;
          custo_item: number;
          fonte_preco: string;
        }>;
        debug?: {
          total_ingredientes: number;
          com_preco: number;
          sem_preco: number;
        };
      };
    },
    enabled: !!id && !!user
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

              <div className="flex items-center gap-4">
                <AvaliacaoEstrelas 
                  media={receita.media_estrelas || 0} 
                  total={receita.total_avaliacoes || 0}
                  tamanho="lg"
                />
                
                {receita.publica && !isPropriaReceita && (
                  <Button 
                    onClick={() => setAvaliacaoDialogOpen(true)}
                    variant="outline"
                    size="sm"
                  >
                    <Star className="mr-2 h-4 w-4" />
                    {(receita.total_avaliacoes || 0) > 0 ? 'Avaliar Receita' : 'Seja o primeiro a avaliar'}
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card de Custo e Disponibilidade */}
        {user && (
          <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Custo da Receita</CardTitle>
                {custoReceita && (
                  <Badge 
                    variant={custoReceita.percentual_disponivel >= 80 ? "default" : 
                            custoReceita.percentual_disponivel >= 50 ? "secondary" : "destructive"}
                  >
                    {custoReceita.percentual_disponivel.toFixed(0)}% disponível
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {loadingCusto ? (
                <div className="space-y-2">
                  <Skeleton className="h-8 w-40" />
                  <Skeleton className="h-6 w-32" />
                </div>
              ) : custoReceita ? (
                <div className="space-y-4">
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">Custo Total</p>
                        <p className="text-2xl font-bold text-primary">
                          R$ {custoReceita.custo_total.toFixed(2)}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">Por Porção</p>
                        <p className="text-2xl font-bold text-primary">
                          R$ {custoReceita.custo_por_porcao.toFixed(2)}
                        </p>
                      </div>
                    </div>
                    
                    {custoReceita.custo_total === 0 && custoReceita.debug && (
                      <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-md">
                        <p className="text-sm text-yellow-700 dark:text-yellow-400">
                          ⚠️ Nenhum preço foi encontrado para os ingredientes. 
                          Adicione notas fiscais ou preços manuais para calcular o custo.
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {custoReceita.debug.sem_preco} de {custoReceita.debug.total_ingredientes} ingredientes sem preço
                        </p>
                      </div>
                    )}
                  </div>

                  {custoReceita.ingredientes.some(i => !i.disponivel) && (
                    <Button 
                      variant="outline" 
                      className="w-full"
                      onClick={async () => {
                        try {
                          const { data, error } = await supabase.functions.invoke('gerar-lista-otimizada', {
                            body: {
                              userId: user?.id,
                              origem: 'receita',
                              receitaId: id,
                              titulo: `Lista: ${receita?.titulo}`
                            }
                          });
                          if (error) throw error;
                          toast.success("Lista criada!");
                          navigate(`/lista-compras/${data.listaId}`);
                        } catch (error) {
                          toast.error("Erro ao criar lista");
                        }
                      }}
                    >
                      <ShoppingCart className="mr-2 h-4 w-4" />
                      Gerar Lista de Compras
                    </Button>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Não foi possível calcular o custo
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Ingredientes com disponibilidade */}
        {ingredientes.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Ingredientes</CardTitle>
            </CardHeader>
            <CardContent>
              {user && custoReceita ? (
                <div className="space-y-3">
                  {custoReceita.ingredientes.map((ingrediente, index) => (
                    <div 
                      key={index} 
                      className="flex items-start justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                    >
                      <div className="flex items-start flex-1">
                        {ingrediente.disponivel ? (
                          <CheckCircle className="h-5 w-5 text-green-600 mr-3 mt-0.5 flex-shrink-0" />
                        ) : (
                          <XCircle className="h-5 w-5 text-destructive mr-3 mt-0.5 flex-shrink-0" />
                        )}
                        <div className="flex-1">
                          <p className="font-medium">{ingrediente.nome}</p>
                          <p className="text-sm text-muted-foreground">
                            {ingrediente.quantidade} {formatarUnidadeMedida(ingrediente.unidade_medida)}
                            {ingrediente.disponivel && ingrediente.quantidade_estoque > 0 && (
                              <span className="ml-2 text-green-600">
                                ({ingrediente.quantidade_estoque.toFixed(1)} em estoque)
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                      
                      <div className="text-right ml-4">
                        {ingrediente.preco_unitario > 0 ? (
                          <>
                            <p className="font-semibold text-primary">
                              R$ {ingrediente.custo_item.toFixed(2)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              R$ {ingrediente.preco_unitario.toFixed(2)}/{formatarUnidadeMedida(ingrediente.unidade_medida)}
                            </p>
                          </>
                        ) : (
                          <p className="text-xs text-destructive">
                            Preço não encontrado
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <ul className="space-y-2">
                  {ingredientes.map((ingrediente, index) => (
                    <li key={index} className="flex items-start">
                      <span className="mr-2">•</span>
                      <span>{ingrediente.produto_nome_busca} - {ingrediente.quantidade}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        )}

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
            
            if (window.location.pathname.includes('/receita/')) {
              queryClient.invalidateQueries({ queryKey: ['receita', id] });
              queryClient.invalidateQueries({ queryKey: ['receita-ingredientes', id] });
              queryClient.invalidateQueries({ queryKey: ['receita-custo', id] });
              queryClient.invalidateQueries({ queryKey: ['receitas_avaliacoes', id] });
            }
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
