import { ItemProduto } from "./ItemProduto";

interface GrupoMercadoProps {
  mercado: {
    id: string;
    nome: string;
    distancia: number;
    total: number;
  };
  produtos: Array<{
    id: string;
    produto_nome: string;
    quantidade: number;
    unidade_medida: string;
    preco_unitario: number;
    preco_total: number;
    melhor_preco: boolean;
    economia?: number;
    comprado: boolean;
  }>;
  onToggleComprado: (itemId: string) => void;
  onQuantidadeChange: (itemId: string, novaQtd: number) => void;
}

export function GrupoMercado({ mercado, produtos, onToggleComprado, onQuantidadeChange }: GrupoMercadoProps) {
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3 p-3 bg-primary/10 rounded-t">
        <div>
          <h3 className="font-semibold flex items-center gap-2">
            🏪 {mercado.nome}
          </h3>
          <p className="text-xs text-muted-foreground">
            {mercado.distancia.toFixed(1)} km • {produtos.length} produtos
          </p>
        </div>
        <div className="text-right">
          <div className="font-bold text-lg">R$ {mercado.total.toFixed(2)}</div>
        </div>
      </div>
      
      <div className="space-y-2">
        {produtos.map((produto) => (
          <ItemProduto 
            key={produto.id} 
            item={produto}
            onToggleComprado={onToggleComprado}
            onQuantidadeChange={onQuantidadeChange}
          />
        ))}
      </div>
    </div>
  );
}