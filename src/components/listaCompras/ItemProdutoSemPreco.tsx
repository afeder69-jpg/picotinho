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
    masterStatus?: string | null;
    ultimo_preco?: {
      valor_unitario: number;
      data_atualizacao: string;
      estabelecimento_nome?: string | null;
    } | null;
  };
  onToggleComprado: (id: string) => void;
  onQuantidadeChange: (id: string, qtd: number) => void;
}

export function ItemProdutoSemPreco({ item, onToggleComprado, onQuantidadeChange }: ItemProdutoSemPrecoProps) {
  const [quantidade, setQuantidade] = useState(item.quantidade);
  const isItemLivre = !item.produto_id;
  // Selo "Aguardando normalização" só aparece se o master estiver explicitamente pendente.
  // Default seguro: master ativo ou status ausente => sem selo.
  const isAguardandoNormalizacao = !isItemLivre && item.masterStatus === 'pendente';

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
              {isItemLivre && (
                <Badge variant="secondary" className="text-xs">
                  Item livre
                </Badge>
              )}
              {isAguardandoNormalizacao && (
                <Badge variant="outline" className="text-xs text-muted-foreground">
                  Aguardando normalização
                </Badge>
              )}
            </div>

            {!isItemLivre && item.ultimo_preco && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="inline-block h-2 w-2 rounded-full bg-destructive" aria-hidden />
                <span>
                  {item.ultimo_preco.estabelecimento_nome
                    ? <>Último preço em {item.ultimo_preco.estabelecimento_nome}: </>
                    : <>Último preço conhecido: </>}
                  R$ {Number(item.ultimo_preco.valor_unitario).toFixed(2).replace('.', ',')}
                  {item.ultimo_preco.data_atualizacao && (
                    <> · {new Date(item.ultimo_preco.data_atualizacao).toLocaleDateString('pt-BR')}</>
                  )}
                </span>
              </div>
            )}

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
