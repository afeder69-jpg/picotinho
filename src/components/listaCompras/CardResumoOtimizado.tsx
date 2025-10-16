import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShoppingCart } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface CardResumoOtimizadoProps {
  modo: 'otimizado' | 'mercado';
  listaId: string;
  tabAtiva: string;
  dados: {
    total: number;
    economia?: number;
    percentualEconomia?: number;
    totalMercados?: number;
    mercados?: Array<{
      nome: string;
      total: number;
      produtos: any[];
      distancia: number;
    }>;
    diferenca?: number;
    nome?: string;
    distancia?: number;
  };
}

export function CardResumoOtimizado({ modo, listaId, tabAtiva, dados }: CardResumoOtimizadoProps) {
  const navigate = useNavigate();
  
  if (!dados) return null;
  
  const handleIrAsCompras = () => {
    navigate(`/lista-compras/${listaId}/comprar?modo=${tabAtiva}`);
  };
  
  const textosBotao = {
    otimizado: '🛒 Comprar em Múltiplos Mercados (Otimizado)',
    mercado: dados.nome ? `🛒 Comprar Tudo no ${dados.nome}` : '🛒 Ir às Compras'
  };
  
  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>💰 Custo Total: R$ {dados.total.toFixed(2)}</span>
          {modo === 'otimizado' && dados.economia && dados.economia > 0 && (
            <Badge variant="default" className="text-lg bg-green-600">
              🎯 Economia: R$ {dados.economia.toFixed(2)} ({dados.percentualEconomia?.toFixed(1)}%)
            </Badge>
          )}
          {modo === 'mercado' && dados.diferenca && dados.diferenca > 0 && (
            <Badge variant="destructive" className="text-lg">
              ⚠️ R$ {dados.diferenca.toFixed(2)} mais caro
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {modo === 'otimizado' && dados.mercados && dados.mercados.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              📍 {dados.totalMercados} mercado{dados.totalMercados && dados.totalMercados > 1 ? 's' : ''} diferentes
            </p>
            
            {dados.mercados.map((mercado, i) => (
              <div key={i} className="flex items-center justify-between p-2 bg-muted rounded">
                <span className="font-medium text-sm">
                  🏪 {mercado.nome}
                </span>
                <div className="text-right">
                  <div className="font-semibold">R$ {mercado.total.toFixed(2)}</div>
                  <div className="text-xs text-muted-foreground">
                    {mercado.produtos.length} produtos • {mercado.distancia.toFixed(1)} km
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {modo === 'mercado' && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              📍 Todos os produtos neste mercado • {dados.distancia?.toFixed(1)} km
            </p>
          </div>
        )}
        
        <div className="mt-4">
          <Button 
            onClick={handleIrAsCompras}
            size="lg" 
            className="w-full"
          >
            <ShoppingCart className="mr-2 h-5 w-5" />
            {textosBotao[modo]}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}