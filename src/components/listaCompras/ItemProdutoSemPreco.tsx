import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { formatarUnidadeListaCompras } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface ItemProdutoSemPrecoProps {
  item: {
    id: string;
    produto_nome: string;
    quantidade: number;
    unidade_medida: string;
    comprado: boolean;
    produto_id?: string | null;
  };
  onToggleComprado: (id: string) => void;
  onQuantidadeChange: (id: string, qtd: number) => void;
}

export function ItemProdutoSemPreco({ item, onToggleComprado, onQuantidadeChange }: ItemProdutoSemPrecoProps) {
  const [quantidade, setQuantidade] = useState(item.quantidade);
  const isItemLivre = !item.produto_id;

  const handleQuantidadeChange = (novaQtd: number) => {
    if (novaQtd <= 0) return;
    setQuantidade(novaQtd);
    onQuantidadeChange(item.id, novaQtd);
  };

  return (
    <Card className={item.comprado ? 'opacity-60' : ''}>
      <CardContent className="p-3">
        <div className="flex items-start gap-3">
          <Checkbox
            checked={item.comprado}
            onCheckedChange={() => onToggleComprado(item.id)}
          />

          <div className="flex-1 space-y-2">
            <div className="flex items-center justify-between">
              <h4 className={`font-medium ${item.comprado ? 'line-through' : ''}`}>
                {(item.produto_nome ?? '').toUpperCase()}
              </h4>
              {isItemLivre ? (
                <Badge variant="secondary" className="text-xs">
                  Item livre
                </Badge>
              ) : (
                <Badge variant="outline" className="text-xs text-muted-foreground">
                  Sem preço disponível
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button
                size="icon"
                variant="outline"
                className="h-8 w-8"
                onClick={() => handleQuantidadeChange(quantidade - 1)}
                disabled={quantidade <= 1}
              >
                <Minus className="h-3 w-3" />
              </Button>
              <Input
                type="number"
                value={quantidade}
                onChange={(e) => handleQuantidadeChange(Number(e.target.value))}
                className="w-16 h-8 text-center text-sm"
                min="1"
              />
              <Button
                size="icon"
                variant="outline"
                className="h-8 w-8"
                onClick={() => handleQuantidadeChange(quantidade + 1)}
              >
                <Plus className="h-3 w-3" />
              </Button>
              <span className="text-xs text-muted-foreground">{formatarUnidadeListaCompras(item.unidade_medida)}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
