import { useForm } from "react-hook-form";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { toast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface CardapioDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  cardapio?: any;
}

interface FormData {
  titulo: string;
  semana_inicio: string;
  semana_fim: string;
}

export function CardapioDialog({ open, onOpenChange, onSuccess, cardapio }: CardapioDialogProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, formState: { errors }, reset } = useForm<FormData>({
    defaultValues: {
      titulo: cardapio?.titulo || '',
      semana_inicio: cardapio?.semana_inicio || '',
      semana_fim: cardapio?.semana_fim || '',
    }
  });

  const onSubmit = async (data: FormData) => {
    if (!user) return;

    // Validar datas - permite cardápios de um único dia
    if (new Date(data.semana_inicio) > new Date(data.semana_fim)) {
      toast({ 
        title: "Data inválida", 
        description: "A data final não pode ser anterior à data inicial",
        variant: "destructive" 
      });
      return;
    }

    setLoading(true);

    try {
      const cardapioData = {
        titulo: data.titulo,
        semana_inicio: data.semana_inicio,
        semana_fim: data.semana_fim,
        user_id: user.id,
      };

      if (cardapio?.id) {
        const { error } = await supabase
          .from('cardapios')
          .update(cardapioData)
          .eq('id', cardapio.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('cardapios')
          .insert([cardapioData]);
        if (error) throw error;
      }

      toast({ title: cardapio?.id ? "Cardápio atualizado!" : "Cardápio criado!" });
      reset();
      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{cardapio?.id ? 'Editar Cardápio' : 'Novo Cardápio'}</DialogTitle>
          <DialogDescription>
            Defina o período e o título do seu cardápio semanal
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <Label htmlFor="titulo">Título do Cardápio *</Label>
            <Input 
              id="titulo" 
              {...register("titulo", { required: true })} 
              placeholder="Ex: Cardápio Semanal - Janeiro"
            />
            {errors.titulo && <p className="text-sm text-destructive">Campo obrigatório</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="semana_inicio">Data Início *</Label>
              <Input 
                id="semana_inicio" 
                type="date"
                {...register("semana_inicio", { required: true })} 
              />
              {errors.semana_inicio && <p className="text-sm text-destructive">Campo obrigatório</p>}
            </div>
            <div>
              <Label htmlFor="semana_fim">Data Fim *</Label>
              <Input 
                id="semana_fim" 
                type="date"
                {...register("semana_fim", { required: true })} 
              />
              {errors.semana_fim && <p className="text-sm text-destructive">Campo obrigatório</p>}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Salvando..." : cardapio?.id ? "Atualizar" : "Criar Cardápio"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
