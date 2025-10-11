import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface AvaliacaoReceitaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  receitaId: string;
  receitaTitulo: string;
  onSuccess: () => void;
}

export function AvaliacaoReceitaDialog({
  open,
  onOpenChange,
  receitaId,
  receitaTitulo,
  onSuccess
}: AvaliacaoReceitaDialogProps) {
  const [estrelas, setEstrelas] = useState<number>(0);
  const [hoverEstrelas, setHoverEstrelas] = useState<number>(0);
  const [comentario, setComentario] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (estrelas === 0) {
      toast.error("Selecione pelo menos 1 estrela");
      return;
    }

    try {
      setLoading(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Você precisa estar logado para avaliar");
        return;
      }

      const { error } = await supabase
        .from('receitas_avaliacoes')
        .insert({
          receita_id: receitaId,
          user_id: user.id,
          estrelas: estrelas,
          comentario: comentario.trim() || null
        });

      if (error) {
        if (error.code === '23505') {
          toast.error("Você já avaliou esta receita");
        } else {
          throw error;
        }
        return;
      }

      toast.success("Avaliação enviada com sucesso!");
      setEstrelas(0);
      setComentario("");
      onSuccess();
    } catch (error) {
      console.error('Erro ao enviar avaliação:', error);
      toast.error("Erro ao enviar avaliação");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Avaliar Receita</DialogTitle>
          <DialogDescription>
            {receitaTitulo}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Seletor de Estrelas */}
          <div className="flex flex-col items-center gap-4">
            <p className="text-sm text-muted-foreground">
              Quantas estrelas você dá para esta receita?
            </p>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setEstrelas(star)}
                  onMouseEnter={() => setHoverEstrelas(star)}
                  onMouseLeave={() => setHoverEstrelas(0)}
                  className="transition-transform hover:scale-110"
                >
                  <Star
                    className={cn(
                      "w-10 h-10 transition-colors",
                      (hoverEstrelas >= star || (hoverEstrelas === 0 && estrelas >= star))
                        ? "text-yellow-400 fill-yellow-400"
                        : "text-gray-300"
                    )}
                  />
                </button>
              ))}
            </div>
            {estrelas > 0 && (
              <p className="text-sm font-medium">
                {estrelas} {estrelas === 1 ? 'estrela' : 'estrelas'}
              </p>
            )}
          </div>

          {/* Campo de Comentário */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Comentário (opcional)
            </label>
            <Textarea
              placeholder="Conte o que achou da receita..."
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              rows={4}
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground text-right">
              {comentario.length}/500
            </p>
          </div>

          {/* Botões */}
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={loading || estrelas === 0}
            >
              {loading ? "Enviando..." : "Enviar Avaliação"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
