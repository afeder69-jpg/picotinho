import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface TabelaComparativaProps {
  open: boolean;
  onClose: () => void;
  comparacao: {
    otimizado: any;
    comparacao: any;
  };
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
          mercadoOtimizado: mercado.nome.substring(0, 1)
        });
      }
    });
  });

  // Adicionar preços de mercados individuais
  const mercadosKeys = Object.keys(comparacao.comparacao || {});
  mercadosKeys.forEach(key => {
    const mercadoData = comparacao.comparacao[key];
    mercadoData.produtos?.forEach((p: any) => {
      const produto = todosProdutos.get(p.produto_nome);
      if (produto) {
        produto[key] = p.preco_unitario;
      }
    });
  });

  const produtos = Array.from(todosProdutos.values());

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[80vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>📊 Comparação de Preços</DialogTitle>
        </DialogHeader>
        
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[200px]">Produto</TableHead>
                <TableHead className="text-right">Otimizado</TableHead>
                {mercadosKeys.map((key, i) => (
                  <TableHead key={key} className="text-right">
                    {comparacao.comparacao[key].nome}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {produtos.map((produto, i) => {
                const menorPreco = Math.min(
                  produto.otimizado,
                  ...mercadosKeys.map(k => produto[k] || Infinity).filter(p => p !== Infinity)
                );

                return (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{produto.nome}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        R$ {produto.otimizado.toFixed(2)}
                        <span className="text-xs text-muted-foreground">({produto.mercadoOtimizado})</span>
                        {produto.otimizado === menorPreco && <span className="text-green-500">🟢</span>}
                      </div>
                    </TableCell>
                    {mercadosKeys.map(key => {
                      const preco = produto[key];
                      return (
                        <TableCell key={key} className="text-right">
                          {preco ? (
                            <div className="flex items-center justify-end gap-1">
                              R$ {preco.toFixed(2)}
                              {preco === menorPreco && <span className="text-green-500">🟢</span>}
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
  );
}