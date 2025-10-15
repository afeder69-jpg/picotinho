import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { SeletorProdutoNormalizado } from "@/components/receitas/SeletorProdutoNormalizado";
import { Pencil, Plus, Trash2, X, Minus } from "lucide-react";

interface EditarListaDialogProps {
  open: boolean;
  onClose: () => void;
  lista: {
    id: string;
    titulo: string;
    listas_compras_itens: Array<{
      id: string;
      produto_nome: string;
      quantidade: number;
      unidade_medida: string;
      comprado: boolean;
    }>;
  };
}

export function EditarListaDialog({ open, onClose, lista }: EditarListaDialogProps) {
  const queryClient = useQueryClient();
  
  const [produtosEditados, setProdutosEditados] = useState(lista.listas_compras_itens);

  const handleAdicionarNovo = async (produto: any, qtd: number, unidade: string) => {
    try {
      const { data, error } = await supabase
        .from('listas_compras_itens')
        .insert({
          produto_nome: produto.nome_padrao,
          quantidade: qtd,
          unidade_medida: unidade,
          lista_id: lista.id,
          comprado: false,
          produto_id: null
        })
        .select()
        .single();

      if (error) throw error;

      setProdutosEditados(prev => [...prev, {
        id: data.id,
        produto_nome: data.produto_nome,
        quantidade: data.quantidade,
        unidade_medida: data.unidade_medida,
        comprado: data.comprado
      }]);

      toast({ 
        title: `✅ ${produto.nome_padrao} adicionado!`,
        description: "Produto salvo e disponível para comparação"
      });
    } catch (error: any) {
      console.error('Erro ao adicionar produto:', error);
      toast({
        title: "❌ Erro ao adicionar produto",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const handleRemoverExistente = async (itemId: string) => {
    try {
      const { error } = await supabase
        .from('listas_compras_itens')
        .delete()
        .eq('id', itemId);

      if (error) throw error;

      setProdutosEditados(prev => prev.filter(p => p.id !== itemId));

      toast({ title: "🗑️ Produto removido" });
    } catch (error: any) {
      console.error('Erro ao remover produto:', error);
      toast({
        title: "❌ Erro ao remover produto",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const handleEditarQuantidade = async (itemId: string, novaQtd: number) => {
    if (novaQtd <= 0) return;
    
    setProdutosEditados(prev =>
      prev.map(p => p.id === itemId ? { ...p, quantidade: novaQtd } : p)
    );

    try {
      const { error } = await supabase
        .from('listas_compras_itens')
        .update({ quantidade: novaQtd })
        .eq('id', itemId);

      if (error) throw error;
    } catch (error: any) {
      console.error('Erro ao atualizar quantidade:', error);
      
      const original = lista.listas_compras_itens.find(p => p.id === itemId);
      if (original) {
        setProdutosEditados(prev =>
          prev.map(p => p.id === itemId ? { ...p, quantidade: original.quantidade } : p)
        );
      }
      
      toast({
        title: "❌ Erro ao atualizar quantidade",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const handleFechar = () => {
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-5 w-5" />
            Editar Lista: {lista.titulo}
          </DialogTitle>
          <DialogDescription>
            Adicione, remova ou edite quantidades. As alterações são salvas automaticamente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* SEÇÃO 1: Adicionar novos produtos */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Plus className="h-4 w-4 text-primary" />
              <Label className="text-base font-semibold">Adicionar Novos Produtos</Label>
            </div>
            <SeletorProdutoNormalizado onAdicionar={handleAdicionarNovo} />
          </div>

          <Separator />

          {/* SEÇÃO 3: Produtos existentes na lista */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">
              📋 Produtos na Lista ({produtosEditados.length})
            </Label>
            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
              {produtosEditados.map(produto => (
                <Card key={produto.id}>
                  <CardContent className="p-3">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="font-medium">{produto.produto_nome}</p>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoverExistente(produto.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>

                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1">
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-7 w-7"
                              onClick={() => handleEditarQuantidade(produto.id, produto.quantidade - 1)}
                              disabled={produto.quantidade <= 1}
                            >
                              <Minus className="h-3 w-3" />
                            </Button>
                            <Input
                              type="number"
                              value={produto.quantidade}
                              onChange={(e) => handleEditarQuantidade(produto.id, parseFloat(e.target.value))}
                              className="w-20 h-7 text-center text-sm"
                              min="0.01"
                              step="0.01"
                            />
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-7 w-7"
                              onClick={() => handleEditarQuantidade(produto.id, produto.quantidade + 1)}
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>

                          <Badge variant="secondary" className="h-7 px-2">
                            {produto.unidade_medida}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="flex justify-end">
          <Button onClick={handleFechar}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
