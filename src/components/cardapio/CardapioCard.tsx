import { Calendar, Clock, Trash2, Edit } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
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
  cardapio: any;
  onClick: () => void;
  onSuccess: () => void;
}

export function CardapioCard({ cardapio, onClick, onSuccess }: CardapioCardProps) {
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);
  const [editarAberto, setEditarAberto] = useState(false);
  const [loading, setLoading] = useState(false);

  const totalReceitas = cardapio.cardapio_receitas?.[0]?.count || 0;

  const handleExcluir = async () => {
    setConfirmarExclusao(false);
    setLoading(true);
    
    try {
      // Deletar receitas do cardápio
      const { error: receitasError } = await supabase
        .from('cardapio_receitas')
        .delete()
        .eq('cardapio_id', cardapio.id);
      
      if (receitasError) throw receitasError;
      
      // Deletar cardápio
      const { error: cardapioError } = await supabase
        .from('cardapios')
        .delete()
        .eq('id', cardapio.id);
      
      if (cardapioError) throw cardapioError;
      
      toast({ title: "Cardápio excluído com sucesso!" });
      onSuccess();
    } catch (error: any) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Card className="hover:shadow-lg transition-shadow cursor-pointer">
        <CardContent className="pt-6" onClick={onClick}>
          <div className="space-y-3">
            <div className="flex items-start justify-between">
              <h3 className="font-semibold text-lg line-clamp-2">{cardapio.titulo}</h3>
              <Calendar className="h-5 w-5 text-primary flex-shrink-0" />
            </div>
            
            <div className="space-y-2 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                <span>
                  {format(new Date(cardapio.semana_inicio), "dd/MM", { locale: ptBR })} até{' '}
                  {format(new Date(cardapio.semana_fim), "dd/MM/yyyy", { locale: ptBR })}
                </span>
              </div>
              
              <div className="text-sm">
                <span className="font-medium text-foreground">{totalReceitas}</span> refeições planejadas
              </div>
            </div>
          </div>
        </CardContent>
        
        <CardFooter className="pt-0 gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              setEditarAberto(true);
            }}
            disabled={loading}
          >
            <Edit className="h-4 w-4 mr-1" />
            Editar
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              setConfirmarExclusao(true);
            }}
            disabled={loading}
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Excluir
          </Button>
        </CardFooter>
      </Card>

      <AlertDialog open={confirmarExclusao} onOpenChange={setConfirmarExclusao}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cardápio?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Todas as refeições planejadas serão removidas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleExcluir}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CardapioDialog
        open={editarAberto}
        onOpenChange={setEditarAberto}
        onSuccess={() => {
          onSuccess();
          setEditarAberto(false);
        }}
        cardapio={cardapio}
      />
    </>
  );
}
