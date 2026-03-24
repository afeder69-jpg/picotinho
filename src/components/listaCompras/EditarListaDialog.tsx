import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { SeletorProdutoNormalizado } from "@/components/receitas/SeletorProdutoNormalizado";
import { Pencil, Plus, Trash2, X, Minus, MessageSquare } from "lucide-react";

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
      produto_id?: string | null;
    }>;
  };
}

export function EditarListaDialog({ open, onClose, lista }: EditarListaDialogProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  
  const [produtosEditados, setProdutosEditados] = useState(lista.listas_compras_itens);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [textoLivre, setTextoLivre] = useState('');
  const prevOpenRef = useRef(open);

  useEffect(() => {
    if (open && !prevOpenRef.current) {
      setProdutosEditados(lista.listas_compras_itens);
    }
    prevOpenRef.current = open;
  }, [open, lista.listas_compras_itens]);

  const handleAdicionarNovo = async (produto: any, qtd: number, unidade: string) => {
    try {
      const produtoExistente = produtosEditados.find(
        p => p.produto_nome.toUpperCase() === produto.nome_padrao.toUpperCase()
      );

      if (produtoExistente) {
        const novaQuantidade = produtoExistente.quantidade + qtd;
        
        const { error } = await supabase
          .from('listas_compras_itens')
          .update({ quantidade: novaQuantidade })
          .eq('id', produtoExistente.id);

        if (error) throw error;

        setProdutosEditados(prev =>
          prev.map(p => p.id === produtoExistente.id 
            ? { ...p, quantidade: novaQuantidade } 
            : p
          )
        );

        toast({ 
          title: `✅ ${produto.nome_padrao} atualizado!`,
          description: `Quantidade aumentada para ${novaQuantidade} ${unidade}`
        });
        
        queryClient.invalidateQueries({ queryKey: ['lista-compras', lista.id] });
        queryClient.invalidateQueries({ queryKey: ['comparacao-precos', lista.id] });
        return;
      }

      const { data, error } = await supabase
        .from('listas_compras_itens')
        .insert({
          produto_nome: produto.nome_padrao,
          quantidade: qtd,
          unidade_medida: unidade,
          lista_id: lista.id,
          comprado: false,
          produto_id: produto.id || null
        })
        .select()
        .single();

      if (error) throw error;

      setProdutosEditados(prev => [...prev, {
        id: data.id,
        produto_nome: data.produto_nome,
        quantidade: data.quantidade,
        unidade_medida: data.unidade_medida,
        comprado: data.comprado,
        produto_id: data.produto_id
      }]);

      toast({ 
        title: `✅ ${produto.nome_padrao} adicionado!`,
        description: "Produto salvo e disponível para comparação"
      });
      
      queryClient.invalidateQueries({ queryKey: ['lista-compras', lista.id] });
      queryClient.invalidateQueries({ queryKey: ['comparacao-precos', lista.id] });
    } catch (error: any) {
      console.error('Erro ao adicionar produto:', error);
      toast({
        title: "❌ Erro ao adicionar produto",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const handleAdicionarItemLivre = async () => {
    const texto = textoLivre.trim();
    if (!texto) {
      toast({ title: "Digite o nome do item", variant: "destructive" });
      return;
    }
    if (texto.length > 200) {
      toast({ title: "Máximo de 200 caracteres", variant: "destructive" });
      return;
    }

    try {
      const { data, error } = await supabase
        .from('listas_compras_itens')
        .insert({
          produto_nome: texto,
          quantidade: 1,
          unidade_medida: 'UN',
          lista_id: lista.id,
          comprado: false,
          produto_id: null,
          item_livre: true
        })
        .select()
        .single();

      if (error) throw error;

      setProdutosEditados(prev => [...prev, {
        id: data.id,
        produto_nome: data.produto_nome,
        quantidade: data.quantidade,
        unidade_medida: data.unidade_medida,
        comprado: data.comprado,
        produto_id: null
      }]);

      setTextoLivre('');
      toast({ title: `✅ Item livre adicionado!` });
      
      queryClient.invalidateQueries({ queryKey: ['lista-compras', lista.id] });
    } catch (error: any) {
      console.error('Erro ao adicionar item livre:', error);
      toast({
        title: "❌ Erro ao adicionar item",
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
    setTextoLivre('');
    onClose();
  };

  const handleExcluirLista = async () => {
    try {
      const { error: errorItens } = await supabase
        .from('listas_compras_itens')
        .delete()
        .eq('lista_id', lista.id);

      if (errorItens) throw errorItens;

      const { error: errorLista } = await supabase
        .from('listas_compras')
        .delete()
        .eq('id', lista.id);

      if (errorLista) throw errorLista;

      toast({
        title: "🗑️ Lista excluída com sucesso",
        description: `A lista "${lista.titulo}" foi removida.`
      });

      setConfirmDeleteOpen(false);
      onClose();
      
      queryClient.invalidateQueries({ queryKey: ['listas-compras'] });
      navigate('/listas-compras');
      
    } catch (error: any) {
      console.error('Erro ao excluir lista:', error);
      toast({
        title: "❌ Erro ao excluir lista",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  return (
    <>
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
          {/* Adicionar produtos do catálogo */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Plus className="h-4 w-4 text-primary" />
              <Label className="text-base font-semibold">Adicionar Produtos do Catálogo</Label>
            </div>
            <SeletorProdutoNormalizado onAdicionar={handleAdicionarNovo} />
          </div>

          {/* Adicionar item livre */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-primary" />
              <Label className="text-base font-semibold">Adicionar Item Livre</Label>
            </div>
            <p className="text-xs text-muted-foreground">
              Digite qualquer item que queira lembrar de comprar
            </p>
            <div className="flex gap-2">
              <Input
                value={textoLivre}
                onChange={(e) => setTextoLivre(e.target.value)}
                placeholder="Ex: biscoito redondinho com creme de maçã"
                maxLength={200}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAdicionarItemLivre();
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleAdicionarItemLivre}
                disabled={!textoLivre.trim()}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <Separator />

          {/* Produtos existentes na lista */}
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
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{produto.produto_nome}</p>
                            {!produto.produto_id && (
                              <Badge variant="secondary" className="text-xs">
                                Item livre
                              </Badge>
                            )}
                          </div>
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

        <DialogFooter className="flex justify-between gap-2">
          <Button 
            variant="destructive" 
            onClick={() => setConfirmDeleteOpen(true)}
            className="flex items-center gap-2"
          >
            <Trash2 className="h-4 w-4" />
            Excluir Lista
          </Button>
          
          <Button onClick={handleFechar}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>🗑️ Excluir Lista de Compras?</AlertDialogTitle>
          <AlertDialogDescription>
            Tem certeza que deseja excluir a lista <strong>"{lista.titulo}"</strong>?
            <br /><br />
            Esta ação não pode ser desfeita. Todos os {produtosEditados.length} produtos 
            desta lista serão removidos permanentemente.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction 
            onClick={handleExcluirLista}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Sim, excluir lista
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
