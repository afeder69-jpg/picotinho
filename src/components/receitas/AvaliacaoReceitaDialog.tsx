import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
  const [estrelas, setEstrelas] = useState(0);
  const [hoverEstrelas, setHoverEstrelas] = useState(0);
  const [comentario, setComentario] = useState("");
  const [enviando, setEnviando] = useState(false);

  const handleSubmit = async () => {
    if (estrelas === 0) {
      toast.error("Por favor, selecione uma avaliação de 1 a 5 estrelas");
      return;
    }

    setEnviando(true);
    
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      toast.error("Você precisa estar logado para avaliar");
      setEnviando(false);
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

    setEnviando(false);

    if (error) {
      if (error.code === '23505') {
        toast.error("Você já avaliou esta receita");
      } else {
        toast.error("Erro ao enviar avaliação: " + error.message);
      }
      return;
    }

    // Resetar formulário
    setEstrelas(0);
    setComentario("");
    
    onSuccess();
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

        <div className="space-y-4 py-4">
          {/* Seletor de Estrelas */}
          <div className="flex flex-col items-center gap-2">
            <p className="text-sm text-muted-foreground">Sua avaliação:</p>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((valor) => (
                <button
                  key={valor}
                  type="button"
                  onClick={() => setEstrelas(valor)}
                  onMouseEnter={() => setHoverEstrelas(valor)}
                  onMouseLeave={() => setHoverEstrelas(0)}
                  className="transition-transform hover:scale-110"
                >
                  <Star
                    className={cn(
                      "h-8 w-8 transition-colors",
                      (hoverEstrelas >= valor || (hoverEstrelas === 0 && estrelas >= valor))
                        ? "fill-yellow-400 text-yellow-400"
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
            <label htmlFor="comentario" className="text-sm font-medium">
              Comentário (opcional)
            </label>
            <Textarea
              id="comentario"
              placeholder="Conte o que você achou da receita..."
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              rows={4}
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground text-right">
              {comentario.length}/500
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={enviando}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={enviando || estrelas === 0}
          >
            {enviando ? "Enviando..." : "Enviar Avaliação"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
