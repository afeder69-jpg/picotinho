import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface TabelaComparativaProps {
  open: boolean;
  onClose: () => void;
  comparacao: {
    otimizado: any;
    comparacao: any;
  };
}

function getRecenciaIndicador(dataAtualizacao?: string): { cor: string; emoji: string; label: string } {
  if (!dataAtualizacao) return { cor: 'text-muted-foreground', emoji: '⚪', label: 'Data desconhecida' };
  
  const agora = new Date();
  const dataPreco = new Date(dataAtualizacao);
  const diffMs = agora.getTime() - dataPreco.getTime();
  const diffDias = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDias <= 3) return { cor: 'text-green-500', emoji: '🟢', label: `Atualizado há ${diffDias} dia(s)` };
  if (diffDias <= 10) return { cor: 'text-yellow-500', emoji: '🟡', label: `Atualizado há ${diffDias} dias` };
  return { cor: 'text-red-500', emoji: '🔴', label: `Atualizado há ${diffDias} dias` };
}

export function TabelaComparativa({ open, onClose, comparacao }: TabelaComparativaProps) {
  if (!comparacao?.otimizado) return null;

  // Obter todos os produtos únicos
  const todosProdutos = new Map();
  
  comparacao.otimizado.mercados?.forEach((mercado: any) => {
    mercado.produtos.forEach((p: any) => {
      if (!todosProdutos.has(p.produto_nome)) {
        todosProdutos.set(p.produto_nome, {
          nome: p.produto_nome,
          otimizado: p.preco_unitario,
          otimizadoData: p.data_atualizacao,
          mercadoOtimizado: mercado.nome.substring(0, 1)
        });
      }
    });
  });

  // Adicionar preços de mercados individuais (IGNORANDO itens históricos — Fase 1.1)
  const allMercadosKeys = Object.keys(comparacao.comparacao || {});
  allMercadosKeys.forEach(key => {
    const mercadoData = comparacao.comparacao[key];
    mercadoData.produtos?.forEach((p: any) => {
      if (p.historico === true) return; // não vaza histórico para comparação cruzada
      const produto = todosProdutos.get(p.produto_nome);
      if (produto) {
        produto[key] = p.preco_unitario;
        produto[`${key}_data`] = p.data_atualizacao;
        produto[`${key}_melhor`] = p.melhor_preco;
      }
    });
  });

  const produtos = Array.from(todosProdutos.values());

  // Filtrar: manter apenas mercados que tenham pelo menos 1 melhor preço
  const mercadosKeys = allMercadosKeys.filter(key => {
    return produtos.some(produto => {
      const preco = produto[key];
      if (!preco) return false;
      // Calcular menor preço entre todos
      const todosPrecos = [
        produto.otimizado,
        ...allMercadosKeys.map(k => produto[k]).filter(Boolean)
      ];
      const menorPreco = Math.min(...todosPrecos);
      return preco === menorPreco;
    });
  });

  return (
    <TooltipProvider>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-5xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>📊 Comparação de Preços</DialogTitle>
            <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1"><span>🟢</span> Até 3 dias</span>
              <span className="flex items-center gap-1"><span>🟡</span> 4–10 dias</span>
              <span className="flex items-center gap-1"><span>🔴</span> +10 dias</span>
            </div>
          </DialogHeader>
          
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[200px]">Produto</TableHead>
                <TableHead className="text-right">Otimizado</TableHead>
                {mercadosKeys.map((key) => (
                  <TableHead key={key} className="text-right">
                    {comparacao.comparacao[key].nome}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {produtos.map((produto, i) => {
                const todosPrecos = [
                  produto.otimizado,
                  ...allMercadosKeys.map(k => produto[k]).filter(Boolean)
                ];
                const menorPreco = Math.min(...todosPrecos);

                const recenciaOtimizado = getRecenciaIndicador(produto.otimizadoData);

                return (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{produto.nome}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        R$ {produto.otimizado.toFixed(2)}
                        <span className="text-xs text-muted-foreground">({produto.mercadoOtimizado})</span>
                        {produto.otimizado === menorPreco && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className={`${recenciaOtimizado.cor} cursor-help`}>{recenciaOtimizado.emoji}</span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{recenciaOtimizado.label}</p>
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </TableCell>
                    {mercadosKeys.map(key => {
                      const preco = produto[key];
                      const recencia = getRecenciaIndicador(produto[`${key}_data`]);
                      return (
                        <TableCell key={key} className="text-right">
                          {preco ? (
                            <div className="flex items-center justify-end gap-1">
                              R$ {preco.toFixed(2)}
                              {preco === menorPreco && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className={`${recencia.cor} cursor-help`}>{recencia.emoji}</span>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>{recencia.label}</p>
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                );
              })}
              
              {/* Linha de totais */}
              <TableRow className="font-bold bg-muted">
                <TableCell>TOTAL</TableCell>
                <TableCell className="text-right">
                  R$ {comparacao.otimizado.total.toFixed(2)}
                </TableCell>
                {mercadosKeys.map(key => {
                  const mercadoData = comparacao.comparacao[key];
                  return (
                    <TableCell key={key} className="text-right">
                      <div>R$ {mercadoData.total.toFixed(2)}</div>
                      {mercadoData.diferenca > 0 && (
                        <div className="text-xs text-destructive">
                          +R$ {mercadoData.diferenca.toFixed(2)}
                        </div>
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
    </TooltipProvider>
  );
}
