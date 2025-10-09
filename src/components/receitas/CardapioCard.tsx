import { useState } from "react";
import { Calendar, ShoppingCart, Pencil, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CardapioDialog } from "./CardapioDialog";

interface CardapioCardProps {
  cardapio: {
    id: string;
    titulo: string;
    semana_inicio: string;
    semana_fim: string;
    created_at: string;
  };
}

export function CardapioCard({ cardapio }: CardapioCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const queryClient = useQueryClient();

  const handleDelete = async () => {
    try {
      const { error } = await supabase
        .from("cardapios")
        .delete()
        .eq("id", cardapio.id);

      if (error) throw error;

      toast.success("Cardápio excluído com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["cardapios"] });
    } catch (error: any) {
      toast.error(error.message || "Erro ao excluir cardápio");
    }
  };

  const formatDate = (date: string) => {
    return format(new Date(date), "dd/MM/yyyy", { locale: ptBR });
  };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <h3 className="font-semibold text-lg mb-1">{cardapio.titulo}</h3>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>
                {formatDate(cardapio.semana_inicio)} - {formatDate(cardapio.semana_fim)}
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowEditDialog(true)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowDeleteDialog(true)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? "Ocultar" : "Ver Receitas"}
          </Button>
          <Button variant="default" size="sm">
            <ShoppingCart className="h-4 w-4 mr-2" />
            Lista
          </Button>
        </div>

        {expanded && (
          <div className="mt-4 pt-4 border-t">
            <p className="text-sm text-muted-foreground">
              Receitas do cardápio aparecerão aqui
            </p>
          </div>
        )}
      </CardContent>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o cardápio "{cardapio.titulo}"? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CardapioDialog
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        cardapio={cardapio}
      />
    </Card>
  );
}
