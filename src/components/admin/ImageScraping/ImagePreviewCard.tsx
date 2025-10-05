import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { CheckCircle2, XCircle, Edit3, Loader2, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ImagePreviewCardProps {
  resultado: {
    produtoId: string;
    skuGlobal: string;
    nomeProduto: string;
    imageUrl?: string;
    imagemPath?: string;
    confianca?: number;
    query?: string;
    status: "success" | "error";
    error?: string;
  };
  onAprovado: () => void;
  onRejeitado: () => void;
}

export function ImagePreviewCard({ resultado, onAprovado, onRejeitado }: ImagePreviewCardProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [editando, setEditando] = useState(false);
  const [novaQuery, setNovaQuery] = useState(resultado.query || "");

  const aprovarImagem = async () => {
    if (resultado.status !== "success" || !resultado.imageUrl) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from("produtos_master_global")
        .update({
          imagem_url: resultado.imageUrl,
          imagem_path: resultado.imagemPath,
          imagem_adicionada_em: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", resultado.produtoId);

      if (error) throw error;

      toast({
        title: "Imagem aprovada!",
        description: `Imagem adicionada para ${resultado.nomeProduto}`,
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

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4 space-y-3">
        {/* Nome do Produto */}
        <div className="space-y-1">
          <h3 className="font-semibold text-sm line-clamp-2">{resultado.nomeProduto}</h3>
          <p className="text-xs text-muted-foreground">SKU: {resultado.skuGlobal}</p>
        </div>

        {/* Preview da Imagem ou Erro */}
        {resultado.status === "success" && resultado.imageUrl ? (
          <>
            <div className="relative aspect-square rounded-lg overflow-hidden bg-muted">
              <img
                src={resultado.imageUrl}
                alt={resultado.nomeProduto}
                className="w-full h-full object-contain"
                loading="lazy"
              />
            </div>

            {/* Confiança */}
            <div className="flex items-center justify-between">
              <Badge variant={resultado.confianca! >= 90 ? "default" : "secondary"}>
                {resultado.confianca}% confiança
              </Badge>
              <span className="text-xs text-muted-foreground">
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
              onClick={() => {
                // Aqui implementaríamos uma nova busca
                toast({
                  title: "Em breve",
                  description: "Funcionalidade de nova busca será implementada",
                });
              }}
            >
              Buscar Novamente
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
