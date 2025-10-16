import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";

interface ProdutoMarcado {
  id: string;
  produto_nome: string;
  quantidade: number;
  unidade_medida: string;
  preco_unitario: number;
  preco_total: number;
  marcado: boolean;
}

interface ItemProdutoInterativoProps {
  produto: ProdutoMarcado;
  onToggle: (id: string) => void;
}

export function ItemProdutoInterativo({ produto, onToggle }: ItemProdutoInterativoProps) {
  return (
    <Card
      className="p-4 cursor-pointer transition-all hover:shadow-md active:scale-[0.98]"
      onClick={() => onToggle(produto.id)}
    >
      <div className="flex items-start gap-3">
        <Checkbox
          checked={produto.marcado}
          onCheckedChange={() => onToggle(produto.id)}
          className="mt-1"
        />
        
        <div className="flex-1 min-w-0">
          <div className={`font-medium transition-all ${
            produto.marcado 
              ? 'line-through text-muted-foreground opacity-60' 
              : 'text-foreground'
          }`}>
            {produto.produto_nome}
          </div>
          
          <div className="flex items-center justify-between mt-2 text-sm">
            <div className="flex items-center gap-3 text-muted-foreground">
              <span>{produto.quantidade} {produto.unidade_medida}</span>
              <span>×</span>
              <span>R$ {produto.preco_unitario.toFixed(2)}</span>
            </div>
            
            <div className={`font-semibold transition-all ${
              produto.marcado ? 'text-primary' : 'text-foreground'
            }`}>
              R$ {produto.preco_total.toFixed(2)}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
