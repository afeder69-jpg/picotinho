import { useState } from "react";
import { useForm } from "react-hook-form";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface IngredientesManagerProps {
  ingredientes: Array<{
    ingrediente: string;
    quantidade: string;
    unidade_medida: string;
  }>;
  onChange: (ingredientes: any[]) => void;
}

export function IngredientesManager({ ingredientes, onChange }: IngredientesManagerProps) {
  const [novoIngrediente, setNovoIngrediente] = useState("");
  const [novaQuantidade, setNovaQuantidade] = useState("");
  const [novaUnidade, setNovaUnidade] = useState("un");

  const adicionarIngrediente = () => {
    if (!novoIngrediente.trim()) return;

    const novo = {
      ingrediente: novoIngrediente.trim(),
      quantidade: novaQuantidade || "1",
      unidade_medida: novaUnidade,
    };

    onChange([...ingredientes, novo]);
    setNovoIngrediente("");
    setNovaQuantidade("");
    setNovaUnidade("un");
  };

  const removerIngrediente = (index: number) => {
    onChange(ingredientes.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-3">
      <Label>Ingredientes</Label>

      {/* Lista de ingredientes */}
      <div className="space-y-2 max-h-40 overflow-y-auto">
        {ingredientes.map((ing, index) => (
          <div key={index} className="flex items-center gap-2 bg-muted p-2 rounded">
            <span className="flex-1 text-sm">
              {ing.quantidade} {ing.unidade_medida} - {ing.ingrediente}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => removerIngrediente(index)}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>

      {/* Adicionar novo ingrediente */}
      <div className="grid grid-cols-12 gap-2">
        <Input
          placeholder="Ingrediente"
          value={novoIngrediente}
          onChange={(e) => setNovoIngrediente(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), adicionarIngrediente())}
          className="col-span-5"
        />
        <Input
          placeholder="Qtd"
          value={novaQuantidade}
          onChange={(e) => setNovaQuantidade(e.target.value)}
          className="col-span-2"
        />
        <Select value={novaUnidade} onValueChange={setNovaUnidade}>
          <SelectTrigger className="col-span-3">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="un">UN</SelectItem>
            <SelectItem value="kg">KG</SelectItem>
            <SelectItem value="g">G</SelectItem>
            <SelectItem value="l">L</SelectItem>
            <SelectItem value="ml">ML</SelectItem>
            <SelectItem value="xic">Xícara</SelectItem>
            <SelectItem value="col">Colher</SelectItem>
          </SelectContent>
        </Select>
        <Button
          type="button"
          onClick={adicionarIngrediente}
          size="sm"
          className="col-span-2"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
