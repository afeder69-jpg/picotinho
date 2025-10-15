import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SelecionarReceitaDialog } from "./SelecionarReceitaDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface DiaCardapioProps {
  cardapioId: string;
  diaSemana: number;
  refeicao: string;
  receitaAtual?: any;
  onSuccess: () => void;
}

export function DiaCardapio({ cardapioId, diaSemana, refeicao, receitaAtual, onSuccess }: DiaCardapioProps) {
  const [dialogAberto, setDialogAberto] = useState(false);

  const handleRemover = async () => {
    if (!receitaAtual?.id) return;
    
    try {
      const { error } = await supabase
        .from('cardapio_receitas')
        .delete()
        .eq('id', receitaAtual.id);
      
      if (error) throw error;
      
      toast({ title: "Receita removida do cardápio" });
      onSuccess();
    } catch (error: any) {
      toast({ title: "Erro ao remover", description: error.message, variant: "destructive" });
    }
  };

  if (receitaAtual?.receitas) {
    return (
      <Card className="p-3 min-h-[120px] relative group hover:shadow-md transition-shadow">
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={handleRemover}
        >
          <X className="h-4 w-4" />
        </Button>
        
        <div className="space-y-2">
          {receitaAtual.receitas.imagem_url && (
            <img 
              src={receitaAtual.receitas.imagem_url} 
              alt={receitaAtual.receitas.titulo}
              className="w-full h-20 object-cover rounded"
            />
          )}
          <div>
            <h4 className="font-medium text-sm line-clamp-2">
              {receitaAtual.receitas.titulo}
            </h4>
            {receitaAtual.receitas.tempo_preparo && (
              <p className="text-xs text-muted-foreground">
                {receitaAtual.receitas.tempo_preparo} min
              </p>
            )}
          </div>
        </div>
      </Card>
    );
  }

  return (
    <>
      <Card 
        className="p-3 min-h-[120px] flex items-center justify-center border-dashed cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors"
        onClick={() => setDialogAberto(true)}
      >
        <Button variant="ghost" size="sm">
          <Plus className="h-4 w-4 mr-1" />
          Adicionar
        </Button>
      </Card>

      <SelecionarReceitaDialog
        open={dialogAberto}
        onOpenChange={setDialogAberto}
        cardapioId={cardapioId}
        diaSemana={diaSemana}
        refeicao={refeicao}
        onSuccess={() => {
          onSuccess();
          setDialogAberto(false);
        }}
      />
    </>
  );
}
