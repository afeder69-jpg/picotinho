import { useState } from "react";
import { useForm } from "react-hook-form";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CardapioReceitasManager } from "./CardapioReceitasManager";

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
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {cardapio ? "Editar Cardápio" : "Novo Cardápio"}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="info" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="info">Informações</TabsTrigger>
            <TabsTrigger value="receitas" disabled={!cardapio}>
              Receitas {!cardapio && "(Salve primeiro)"}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="info">
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="titulo">Título do Cardápio</Label>
                <Input
                  id="titulo"
                  {...register("titulo")}
                  placeholder="Ex: Cardápio Semanal - Janeiro"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="semana_inicio">Data Início</Label>
                  <Input
                    id="semana_inicio"
                    type="date"
                    {...register("semana_inicio")}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="semana_fim">Data Fim</Label>
                  <Input
                    id="semana_fim"
                    type="date"
                    {...register("semana_fim")}
                  />
                </div>
              </div>

              <div className="flex gap-2 justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading ? "Salvando..." : cardapio ? "Atualizar" : "Salvar"}
                </Button>
              </div>
            </form>
          </TabsContent>

          <TabsContent value="receitas">
            {cardapio && (
              <CardapioReceitasManager cardapioId={cardapio.id} />
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
