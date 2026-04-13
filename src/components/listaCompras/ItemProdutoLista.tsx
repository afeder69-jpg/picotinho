import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import SwipeableListaItem from "./SwipeableListaItem";

interface ItemLista {
  id: string;
  produto_nome: string;
  quantidade: number;
  unidade_medida: string;
  comprado: boolean;
  item_livre?: boolean;
  produto_id?: string | null;
}

interface ItemProdutoListaProps {
  item: ItemLista;
  onToggleComprado: (id: string) => void;
  onRemover: (id: string) => void;
  onEditarQuantidade: (item: ItemLista) => void;
}

export function ItemProdutoLista({ item, onToggleComprado, onRemover, onEditarQuantidade }: ItemProdutoListaProps) {
  return (
    <SwipeableListaItem
      onSwipeRight={() => onRemover(item.id)}
      onSwipeLeft={() => onEditarQuantidade(item)}
    >
      <Card className={item.comprado ? 'opacity-60' : ''}>
        <CardContent className="p-3">
          <div className="flex items-center gap-3">
            <Checkbox
              checked={item.comprado}
              onCheckedChange={() => onToggleComprado(item.id)}
            />

            <div className="flex-1 min-w-0">
              <h4 className={`font-medium text-sm truncate ${item.comprado ? 'line-through text-muted-foreground' : ''}`}>
                {item.produto_nome}
              </h4>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span className="text-sm text-muted-foreground">
                {item.quantidade} {item.unidade_medida}
              </span>
              {item.item_livre && (
                <Badge variant="secondary" className="text-xs">
                  Item livre
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </SwipeableListaItem>
  );
}
