import { useState } from "react";
import { useForm } from "react-hook-form";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface CardapioDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cardapio?: {
    id: string;
    titulo: string;
    semana_inicio: string;
    semana_fim: string;
  };
}

export function CardapioDialog({ open, onOpenChange, cardapio }: CardapioDialogProps) {
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();
  const { register, handleSubmit, reset } = useForm({
    defaultValues: cardapio ? {
      titulo: cardapio.titulo,
      semana_inicio: cardapio.semana_inicio,
      semana_fim: cardapio.semana_fim,
    } : {},
  });

  const onSubmit = async (data: any) => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      if (cardapio) {
        // Editar cardápio existente
        const { error } = await supabase
          .from("cardapios")
          .update({
            titulo: data.titulo,
            semana_inicio: data.semana_inicio,
            semana_fim: data.semana_fim,
          })
          .eq("id", cardapio.id);

        if (error) throw error;
        toast.success("Cardápio atualizado com sucesso!");
      } else {
        // Criar novo cardápio
        const { error } = await supabase.from("cardapios").insert({
          user_id: user.id,
          titulo: data.titulo,
          semana_inicio: data.semana_inicio,
          semana_fim: data.semana_fim,
        });

        if (error) throw error;
        toast.success("Cardápio criado com sucesso!");
      }

      queryClient.invalidateQueries({ queryKey: ["cardapios"] });
      reset();
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || "Erro ao salvar cardápio");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{cardapio ? "Editar Cardápio" : "Novo Cardápio Semanal"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <Label>Título do Cardápio</Label>
            <Input {...register("titulo", { required: true })} placeholder="Ex: Cardápio da Semana" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Data Início</Label>
              <Input type="date" {...register("semana_inicio", { required: true })} />
            </div>
            <div>
              <Label>Data Fim</Label>
              <Input type="date" {...register("semana_fim", { required: true })} />
            </div>
          </div>

          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
              Cancelar
            </Button>
            <Button type="submit" disabled={loading} className="flex-1">
              {loading ? "Salvando..." : cardapio ? "Atualizar" : "Criar Cardápio"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
