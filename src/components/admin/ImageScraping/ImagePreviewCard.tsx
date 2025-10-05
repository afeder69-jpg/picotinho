import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { CheckCircle2, XCircle, Edit3, Loader2, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface OpcaoImagem {
  imageUrl: string;
  imagemPath: string;
  titulo?: string;
  contexto?: string;
  posicao: number;
  confianca: number;
}

interface ImagePreviewCardProps {
  resultado: {
    produtoId: string;
    skuGlobal: string;
    nomeProduto: string;
    opcoesImagens?: OpcaoImagem[];
    imageUrl?: string;
    imagemPath?: string;
    confianca?: number;
    query?: string;
    status: "success" | "error";
    error?: string;
  };
  onAprovado: () => void;
  onRejeitado: () => void;
  onResultadoAtualizado?: (novoResultado: ImagePreviewCardProps['resultado']) => void;
}

export function ImagePreviewCard({ resultado, onAprovado, onRejeitado, onResultadoAtualizado }: ImagePreviewCardProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [editando, setEditando] = useState(false);
  const [novaQuery, setNovaQuery] = useState(resultado.query || "");
  const [buscando, setBuscando] = useState(false);
  const [imagemKey, setImagemKey] = useState(Date.now());
  const [imagemSelecionada, setImagemSelecionada] = useState(0);
  
  // Normalizar para sempre trabalhar com opções de imagens
  const opcoes: OpcaoImagem[] = resultado.opcoesImagens || 
    (resultado.imageUrl ? [{
      imageUrl: resultado.imageUrl,
      imagemPath: resultado.imagemPath || '',
      confianca: resultado.confianca || 90,
      posicao: 1
    }] : []);

  const aprovarImagem = async () => {
    if (resultado.status !== "success" || opcoes.length === 0) return;

    const imagemEscolhida = opcoes[imagemSelecionada];

    setLoading(true);
    try {
      const { error } = await supabase
        .from("produtos_master_global")
        .update({
          imagem_url: imagemEscolhida.imageUrl,
          imagem_path: imagemEscolhida.imagemPath,
          imagem_adicionada_em: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", resultado.produtoId);

      if (error) throw error;

      // Limpar imagens não usadas do Storage
      for (let i = 0; i < opcoes.length; i++) {
        if (i !== imagemSelecionada && opcoes[i].imagemPath) {
          await supabase.storage
            .from("produtos-master-fotos")
            .remove([opcoes[i].imagemPath]);
        }
      }

      toast({
        title: "Imagem aprovada!",
        description: `Opção ${imagemEscolhida.posicao}/${opcoes.length} selecionada para ${resultado.nomeProduto}`,
      });

      onAprovado();
    } catch (error: any) {
      toast({
        title: "Erro ao aprovar",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const rejeitarImagem = () => {
    onRejeitado();
  };

  const editarBusca = () => {
    setEditando(!editando);
  };

  const buscarNovamente = async () => {
    if (!novaQuery.trim()) {
      toast({
        title: "Query inválida",
        description: "Digite uma query de busca válida",
        variant: "destructive",
      });
      return;
    }

    setBuscando(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "buscar-imagens-produtos",
        {
          body: {
            produtoIds: [resultado.produtoId],
            customQueries: {
              [resultado.produtoId]: novaQuery,
            },
          },
        }
      );

      if (error) throw error;

      const novoResultado = data.resultados[0];
      
      console.log("🔍 Resultado anterior:", {
        imageUrl: resultado.imageUrl,
        confianca: resultado.confianca
      });

      console.log("🆕 Novo resultado:", novoResultado);
      
      if (novoResultado.status === "success") {
        toast({
          title: "✅ Nova imagem encontrada!",
          description: `Confiança: ${novoResultado.confianca}%`,
        });
        
        // Atualizar o card com o novo resultado
        if (onResultadoAtualizado) {
          onResultadoAtualizado({
            ...resultado,
            ...novoResultado,
            query: novaQuery,
          });
          setImagemKey(Date.now());
        }
        
        setEditando(false);
      } else {
        toast({
          title: "Nenhuma imagem encontrada",
          description: novoResultado.error,
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Erro na busca",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setBuscando(false);
    }
  };

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4 space-y-3">
        {/* Nome do Produto */}
        <div className="space-y-1">
          <h3 className="font-semibold text-sm line-clamp-2">{resultado.nomeProduto}</h3>
          <p className="text-xs text-muted-foreground">SKU: {resultado.skuGlobal}</p>
        </div>

        {/* Preview da Imagem ou Erro */}
        {resultado.status === "success" && opcoes.length > 0 ? (
          <>
            {/* Preview da imagem selecionada */}
            <div className="relative aspect-square rounded-lg overflow-hidden bg-muted">
              <img
                key={`${imagemKey}-${imagemSelecionada}`}
                src={`${opcoes[imagemSelecionada].imageUrl}?t=${imagemKey}`}
                alt={opcoes[imagemSelecionada].titulo || resultado.nomeProduto}
                className="w-full h-full object-contain"
                loading="lazy"
              />
              
              {/* Badge com posição */}
              {opcoes.length > 1 && (
                <Badge className="absolute top-2 right-2 bg-background/80 backdrop-blur-sm">
                  {imagemSelecionada + 1}/{opcoes.length}
                </Badge>
              )}
            </div>

            {/* Thumbnails para seleção (se houver múltiplas opções) */}
            {opcoes.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-2">
                {opcoes.map((opcao, index) => (
                  <button
                    key={index}
                    onClick={() => {
                      setImagemSelecionada(index);
                      setImagemKey(Date.now());
                    }}
                    className={`relative flex-shrink-0 w-20 h-20 rounded-md overflow-hidden border-2 transition-all ${
                      imagemSelecionada === index 
                        ? 'border-primary ring-2 ring-primary/50 scale-105' 
                        : 'border-muted hover:border-primary/50'
                    }`}
                  >
                    <img
                      src={`${opcao.imageUrl}?t=${Date.now()}`}
                      alt={`Opção ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                    {imagemSelecionada === index && (
                      <div className="absolute inset-0 bg-primary/10 flex items-center justify-center">
                        <CheckCircle2 className="w-5 h-5 text-primary" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* Info da opção selecionada */}
            <div className="space-y-1">
              {opcoes[imagemSelecionada].titulo && (
                <p className="text-xs text-muted-foreground line-clamp-1">
                  <strong>Título:</strong> {opcoes[imagemSelecionada].titulo}
                </p>
              )}
              {opcoes[imagemSelecionada].contexto && (
                <p className="text-xs text-muted-foreground line-clamp-2">
                  <strong>Contexto:</strong> {opcoes[imagemSelecionada].contexto}
                </p>
              )}
            </div>

            {/* Confiança e Query */}
            <div className="flex items-center justify-between gap-2">
              <Badge variant={opcoes[imagemSelecionada].confianca >= 90 ? "default" : "secondary"}>
                {opcoes[imagemSelecionada].confianca}% confiança
              </Badge>
              <span className="text-xs text-muted-foreground truncate">
                Query: "{resultado.query}"
              </span>
            </div>

            {/* Ações */}
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="default"
                className="flex-1 gap-1"
                onClick={aprovarImagem}
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                Aprovar
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={rejeitarImagem}
                disabled={loading}
              >
                <XCircle className="w-4 h-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={editarBusca}
                disabled={loading}
              >
                <Edit3 className="w-4 h-4" />
              </Button>
            </div>
          </>
        ) : (
          <div className="space-y-3">
            <div className="aspect-square rounded-lg bg-muted flex items-center justify-center">
              <AlertCircle className="w-12 h-12 text-muted-foreground" />
            </div>
            <div className="text-center">
              <p className="text-sm text-destructive">{resultado.error}</p>
              {resultado.query && (
                <p className="text-xs text-muted-foreground mt-1">Query: "{resultado.query}"</p>
              )}
            </div>
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              onClick={editarBusca}
            >
              <Edit3 className="w-4 h-4 mr-2" />
              Tentar Nova Busca
            </Button>
          </div>
        )}

        {/* Editar Query */}
        {editando && (
          <div className="space-y-2 pt-2 border-t">
            <Input
              value={novaQuery}
              onChange={(e) => setNovaQuery(e.target.value)}
              placeholder="Digite uma nova busca..."
              className="text-sm"
            />
            <Button
              size="sm"
              variant="secondary"
              className="w-full"
              onClick={buscarNovamente}
              disabled={buscando || !novaQuery.trim()}
            >
              {buscando ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Buscando...
                </>
              ) : (
                "Buscar Novamente"
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
