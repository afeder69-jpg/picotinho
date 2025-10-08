import { useState } from "react";
import { useForm } from "react-hook-form";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface ReceitaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ReceitaDialog({ open, onOpenChange }: ReceitaDialogProps) {
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();
  const { register, handleSubmit, reset, setValue } = useForm();

  const onSubmit = async (data: any) => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const { error } = await supabase.from("receitas").insert({
        titulo: data.titulo,
        descricao: data.descricao,
        tempo_preparo: parseInt(data.tempo_preparo) || 0,
        porcoes: parseInt(data.porcoes) || 1,
        instrucoes: data.modo_preparo || "",
        fonte: 'minha',
        user_id: user.id,
      });

      if (error) throw error;

      toast.success("Receita criada com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["receitas-disponiveis"] });
      reset();
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || "Erro ao criar receita");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova Receita</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <Label>Título</Label>
            <Input {...register("titulo", { required: true })} placeholder="Nome da receita" />
          </div>

          <div>
            <Label>Categoria</Label>
            <Select onValueChange={(value) => setValue("categoria", value)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione uma categoria" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cafe_manha">Café da Manhã</SelectItem>
                <SelectItem value="almoco">Almoço</SelectItem>
                <SelectItem value="jantar">Jantar</SelectItem>
                <SelectItem value="lanche">Lanche</SelectItem>
                <SelectItem value="sobremesa">Sobremesa</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Preparo (min)</Label>
              <Input type="number" {...register("tempo_preparo")} placeholder="30" />
            </div>
            <div>
              <Label>Cozimento (min)</Label>
              <Input type="number" {...register("tempo_cozimento")} placeholder="0" />
            </div>
            <div>
              <Label>Porções</Label>
              <Input type="number" {...register("porcoes")} placeholder="4" />
            </div>
          </div>

          <div>
            <Label>Descrição</Label>
            <Textarea {...register("descricao")} placeholder="Breve descrição da receita" rows={2} />
          </div>

          <div>
            <Label>Modo de Preparo</Label>
            <Textarea {...register("modo_preparo")} placeholder="Digite cada passo em uma linha" rows={6} />
          </div>

          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
              Cancelar
            </Button>
            <Button type="submit" disabled={loading} className="flex-1">
              {loading ? "Criando..." : "Criar Receita"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
