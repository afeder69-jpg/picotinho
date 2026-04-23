import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { formatarUnidadeListaCompras } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getRecenciaIndicador } from "@/lib/recencia";

interface ItemProdutoProps {
  item: {
    id: string;
    produto_nome: string;
    quantidade: number;
    unidade_medida: string;
    preco_unitario: number;
    preco_total: number;
    melhor_preco: boolean;
    economia?: number;
    comprado: boolean;
    historico?: boolean;
    aguardando_normalizacao?: boolean;
    data_atualizacao?: string;
  };
  onToggleComprado: (id: string) => void;
  onQuantidadeChange: (id: string, qtd: number) => void;
}

export function ItemProduto({ item, onToggleComprado, onQuantidadeChange }: ItemProdutoProps) {
  const [quantidade, setQuantidade] = useState(item.quantidade);

  const handleQuantidadeChange = (novaQtd: number) => {
    if (novaQtd <= 0) return;
    setQuantidade(novaQtd);
    onQuantidadeChange(item.id, novaQtd);
  };

  // Indicador de recência baseado na data REAL da nota fiscal (precos_atuais.data_atualizacao).
  // Só exibimos quando há data e quando NÃO é histórico fiscal (histórico já tem seu próprio sinal vermelho).
  const recencia = !item.historico && item.data_atualizacao
    ? getRecenciaIndicador(item.data_atualizacao)
    : null;

  return (
    <TooltipProvider>
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
                <div className="flex items-center gap-2">
                  <span className="font-bold">R$ {item.preco_unitario.toFixed(2)}</span>
                  {item.historico && (
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-full bg-red-500"
                      title="Preço histórico (sem cotação atual neste mercado)"
                      aria-label="Preço histórico"
                    />
                  )}
                  {recencia && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span
                          className={`inline-block w-2.5 h-2.5 rounded-full ${recencia.bg} cursor-help`}
                          aria-label={recencia.label}
                        />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{recencia.label}</p>
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
              </div>

              {/* Linha de selos: melhor preço (texto, não conflita com bolinha de recência),
                  aguardando normalização, economia/diferença */}
              <div className="flex items-center gap-2 flex-wrap">
                {item.melhor_preco && !item.historico && (
                  <Badge variant="default" className="text-[10px] h-5 px-1.5 bg-green-600 hover:bg-green-600">
                    ✨ Melhor preço
                  </Badge>
                )}

                {item.aguardando_normalizacao && (
                  <Badge variant="outline" className="text-[10px] h-5 px-1.5 text-muted-foreground border-muted-foreground/30">
                    Aguardando normalização
                  </Badge>
                )}

                {item.melhor_preco && !item.historico && item.economia && item.economia > 0 && (
                  <Badge variant="default" className="text-xs bg-green-600 hover:bg-green-600">
                    Economia de R$ {item.economia.toFixed(2)}
                  </Badge>
                )}
                
                {!item.melhor_preco && !item.historico && item.economia && item.economia > 0 && (
                  <Badge variant="destructive" className="text-xs">
                    ⚠️ R$ {item.economia.toFixed(2)} mais caro
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
    </TooltipProvider>
  );
}
