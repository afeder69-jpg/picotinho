import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

interface ResumoComprasAtivasProps {
  totalLista: number;
  totalMarcado: number;
  quantidadeMarcada: number;
  totalProdutos: number;
}

export function ResumoComprasAtivas({
  totalLista,
  totalMarcado,
  quantidadeMarcada,
  totalProdutos
}: ResumoComprasAtivasProps) {
  const percentual = totalProdutos > 0 ? (quantidadeMarcada / totalProdutos) * 100 : 0;
  
  return (
    <Card className="mx-4 mt-4 p-4 bg-primary/5 border-primary/20">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-muted-foreground">
            💰 Resumo das Compras
          </span>
          <span className="text-xs text-muted-foreground">
            {quantidadeMarcada} de {totalProdutos} produtos
          </span>
        </div>
        
        <Progress value={percentual} className="h-2" />
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-xs text-muted-foreground mb-1">Total da Lista</div>
            <div className="text-lg font-bold text-foreground">
              R$ {totalLista.toFixed(2)}
            </div>
          </div>
          
          <div>
            <div className="text-xs text-muted-foreground mb-1">Total Marcado</div>
            <div className="text-lg font-bold text-primary">
              R$ {totalMarcado.toFixed(2)}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
