import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, ShoppingCart, TrendingDown, AlertCircle } from 'lucide-react';
import { formatarNomeParaExibicao } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface PrecoMercado {
  valor_unitario: number;
  data_atualizacao: string;
  estabelecimento_nome: string;
  estabelecimento_cnpj: string;
}

interface ResultadoPrecosProps {
  precos: PrecoMercado[];
  carregando: boolean;
  produtoSelecionado: boolean;
  onAdicionarLista: (preco: PrecoMercado) => void;
}

function getFrescorInfo(dataStr: string) {
  const data = new Date(dataStr);
  const agora = new Date();
  const diffMs = agora.getTime() - data.getTime();
  const diffDias = diffMs / (1000 * 60 * 60 * 24);

  if (diffDias <= 3) {
    return { cor: 'bg-green-500', label: 'Atualizado', ring: 'ring-green-500/20' };
  } else if (diffDias <= 10) {
    return { cor: 'bg-yellow-500', label: 'Recente', ring: 'ring-yellow-500/20' };
  } else {
    return { cor: 'bg-red-500', label: 'Antigo', ring: 'ring-red-500/20' };
  }
}

const ResultadoPrecos = ({ precos, carregando, produtoSelecionado, onAdicionarLista }: ResultadoPrecosProps) => {
  if (!produtoSelecionado) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <TrendingDown className="w-12 h-12 text-muted-foreground/30 mb-4" />
        <p className="text-muted-foreground">
          Busque um produto para ver os preços nos mercados da sua área
        </p>
      </div>
    );
  }

  if (carregando) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary mb-3" />
        <p className="text-sm text-muted-foreground">Consultando preços...</p>
      </div>
    );
  }

  if (precos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <AlertCircle className="w-10 h-10 text-muted-foreground/40 mb-3" />
        <p className="text-muted-foreground font-medium">Nenhum preço encontrado</p>
        <p className="text-sm text-muted-foreground/70 mt-1">
          Não há registros de preço para este produto nos mercados da sua área
        </p>
      </div>
    );
  }

  const menorPreco = precos[0]?.valor_unitario;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground text-sm">
          Preços encontrados ({precos.length} {precos.length === 1 ? 'mercado' : 'mercados'})
        </h3>
      </div>

      {precos.map((preco, idx) => {
        const frescor = getFrescorInfo(preco.data_atualizacao);
        const isMenor = preco.valor_unitario === menorPreco;

        return (
          <Card
            key={`${preco.estabelecimento_cnpj}-${idx}`}
            className={`transition-all ${isMenor ? 'border-primary/40 bg-primary/5' : ''}`}
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  {/* Freshness indicator */}
                  <div className={`w-3 h-3 rounded-full ${frescor.cor} mt-1.5 shrink-0 ring-4 ${frescor.ring}`} />

                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-foreground text-sm truncate">
                      {formatarNomeParaExibicao(preco.estabelecimento_nome)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatDistanceToNow(new Date(preco.data_atualizacao), {
                        addSuffix: true,
                        locale: ptBR,
                      })}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <p className={`font-bold text-lg ${isMenor ? 'text-primary' : 'text-foreground'}`}>
                      R$ {preco.valor_unitario.toFixed(2).replace('.', ',')}
                    </p>
                    {isMenor && precos.length > 1 && (
                      <span className="text-xs text-primary font-medium">Menor preço</span>
                    )}
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-muted-foreground hover:text-primary"
                    onClick={() => onAdicionarLista(preco)}
                    title="Adicionar à lista"
                  >
                    <ShoppingCart className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}

      {/* Legend */}
      <div className="flex items-center gap-4 pt-2 px-1">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-green-500" />
          <span className="text-xs text-muted-foreground">≤ 3 dias</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-yellow-500" />
          <span className="text-xs text-muted-foreground">4-10 dias</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-red-500" />
          <span className="text-xs text-muted-foreground">&gt; 10 dias</span>
        </div>
      </div>
    </div>
  );
};

export default ResultadoPrecos;
