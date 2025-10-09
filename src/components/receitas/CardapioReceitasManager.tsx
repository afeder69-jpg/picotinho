import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Plus, Trash2, Search } from "lucide-react";
import { toast } from "sonner";

interface CardapioReceitasManagerProps {
  cardapioId: string;
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

export function CardapioReceitasManager({
  cardapioId,
}: CardapioReceitasManagerProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedReceita, setSelectedReceita] = useState("");
  const [diaSemana, setDiaSemana] = useState("");
  const [refeicao, setRefeicao] = useState("");
  const queryClient = useQueryClient();

  const { data: receitas } = useQuery({
    queryKey: ["receitas-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("receitas")
        .select("*")
        .order("titulo");

      if (error) throw error;
      return data;
    },
  });

  const { data: receitasAdicionadas } = useQuery({
    queryKey: ["cardapio-receitas", cardapioId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cardapio_receitas")
        .select(`
          *,
          receitas (
            id,
            titulo,
            categoria
          )
        `)
        .eq("cardapio_id", cardapioId);

      if (error) throw error;
      return data;
    },
  });

  const receitasFiltradas = receitas?.filter((r) =>
    r.titulo.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleAdicionar = async () => {
    if (!selectedReceita || !diaSemana || !refeicao) {
      toast.error("Preencha todos os campos");
      return;
    }

    try {
      const { error } = await supabase.from("cardapio_receitas").insert({
        cardapio_id: cardapioId,
        receita_id: selectedReceita,
        dia_semana: parseInt(diaSemana),
        refeicao: refeicao,
      });

      if (error) throw error;

      toast.success("Receita adicionada ao cardápio!");
      queryClient.invalidateQueries({ queryKey: ["cardapio-receitas"] });
      setSelectedReceita("");
      setDiaSemana("");
      setRefeicao("");
    } catch (error: any) {
      toast.error(error.message || "Erro ao adicionar receita");
    }
  };

  const handleRemover = async (id: string) => {
    try {
      const { error } = await supabase
        .from("cardapio_receitas")
        .delete()
        .eq("id", id);

      if (error) throw error;

      toast.success("Receita removida do cardápio");
      queryClient.invalidateQueries({ queryKey: ["cardapio-receitas"] });
    } catch (error: any) {
      toast.error(error.message || "Erro ao remover receita");
    }
  };

  return (
    <div className="space-y-6">
      {/* Adicionar Nova Receita */}
      <Card className="p-4">
        <h3 className="font-semibold mb-4">Adicionar Receita</h3>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Buscar Receita</Label>
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Digite para buscar..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Receita</Label>
            <Select value={selectedReceita} onValueChange={setSelectedReceita}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione uma receita" />
              </SelectTrigger>
              <SelectContent>
                {receitasFiltradas?.map((receita) => (
                  <SelectItem key={receita.id} value={receita.id}>
                    {receita.titulo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Dia da Semana</Label>
              <Select value={diaSemana} onValueChange={setDiaSemana}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
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
                  <SelectValue placeholder="Selecione" />
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
          </div>

          <Button onClick={handleAdicionar} className="w-full">
            <Plus className="h-4 w-4 mr-2" />
            Adicionar ao Cardápio
          </Button>
        </div>
      </Card>

      {/* Lista de Receitas Adicionadas */}
      <div>
        <h3 className="font-semibold mb-4">Receitas Adicionadas</h3>
        {!receitasAdicionadas || receitasAdicionadas.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma receita adicionada ainda
          </p>
        ) : (
          <div className="space-y-2">
            {receitasAdicionadas.map((item) => (
              <Card key={item.id} className="p-3">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="font-medium">
                      {item.receitas?.titulo || "Receita removida"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {diasSemana.find((d) => d.value === item.dia_semana)?.label} -{" "}
                      {refeicoes.find((r) => r.value === item.refeicao)?.label}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemover(item.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
