import { useState } from "react";
import { Calendar } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface AdicionarReceitaCardapioDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  receitaId: string;
  receitaNome: string;
}

const diasSemana = [
  { value: 0, label: "Domingo" },
  { value: 1, label: "Segunda-feira" },
  { value: 2, label: "Terça-feira" },
  { value: 3, label: "Quarta-feira" },
  { value: 4, label: "Quinta-feira" },
  { value: 5, label: "Sexta-feira" },
  { value: 6, label: "Sábado" },
];

const refeicoes = [
  { value: "cafe_manha", label: "Café da Manhã" },
  { value: "almoco", label: "Almoço" },
  { value: "jantar", label: "Jantar" },
  { value: "lanche", label: "Lanche" },
];

export function AdicionarReceitaCardapioDialog({
  open,
  onOpenChange,
  receitaId,
  receitaNome,
}: AdicionarReceitaCardapioDialogProps) {
  const [cardapioId, setCardapioId] = useState("");
  const [diaSemana, setDiaSemana] = useState("");
  const [refeicao, setRefeicao] = useState("");
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();

  const { data: cardapios } = useQuery({
    queryKey: ["cardapios"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cardapios")
        .select("*")
        .order("semana_inicio", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!cardapioId || !diaSemana || !refeicao) {
      toast.error("Preencha todos os campos");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.from("cardapio_receitas").insert({
        cardapio_id: cardapioId,
        receita_id: receitaId,
        dia_semana: parseInt(diaSemana),
        refeicao: refeicao,
      });

      if (error) throw error;

      toast.success(`${receitaNome} adicionada ao cardápio!`);
      queryClient.invalidateQueries({ queryKey: ["cardapio-receitas"] });
      onOpenChange(false);
      setCardapioId("");
      setDiaSemana("");
      setRefeicao("");
    } catch (error: any) {
      toast.error(error.message || "Erro ao adicionar receita ao cardápio");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Adicionar ao Cardápio
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Cardápio</Label>
            <Select value={cardapioId} onValueChange={setCardapioId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um cardápio" />
              </SelectTrigger>
              <SelectContent>
                {cardapios?.map((cardapio) => (
                  <SelectItem key={cardapio.id} value={cardapio.id}>
                    {cardapio.titulo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Dia da Semana</Label>
            <Select value={diaSemana} onValueChange={setDiaSemana}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o dia" />
              </SelectTrigger>
              <SelectContent>
                {diasSemana.map((dia) => (
                  <SelectItem key={dia.value} value={dia.value.toString()}>
                    {dia.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Refeição</Label>
            <Select value={refeicao} onValueChange={setRefeicao}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a refeição" />
              </SelectTrigger>
              <SelectContent>
                {refeicoes.map((ref) => (
                  <SelectItem key={ref.value} value={ref.value}>
                    {ref.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
              {loading ? "Adicionando..." : "Adicionar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
