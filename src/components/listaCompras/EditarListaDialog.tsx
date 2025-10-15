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
import { Pencil, Plus, Trash2, X, Minus, Save, Loader2, Undo2 } from "lucide-react";

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
  const [produtosParaAdicionar, setProdutosParaAdicionar] = useState<Array<{
    produto_nome: string;
    quantidade: number;
    unidade_medida: string;
  }>>([]);
  const [produtosParaRemover, setProdutosParaRemover] = useState<Set<string>>(new Set());
  const [salvando, setSalvando] = useState(false);

  const handleAdicionarNovo = (produto: any, qtd: number, unidade: string) => {
    setProdutosParaAdicionar(prev => [...prev, {
      produto_nome: produto.nome_padrao,
      quantidade: qtd,
      unidade_medida: unidade
    }]);
    toast({ title: `✅ ${produto.nome_padrao} adicionado à lista temporária` });
  };

  const handleRemoverExistente = (itemId: string) => {
    setProdutosParaRemover(prev => new Set(prev).add(itemId));
    toast({ title: "🗑️ Produto marcado para remoção" });
  };

  const handleCancelarRemocao = (itemId: string) => {
    setProdutosParaRemover(prev => {
      const novo = new Set(prev);
      novo.delete(itemId);
      return novo;
    });
  };

  const handleEditarQuantidade = (itemId: string, novaQtd: number) => {
    if (novaQtd <= 0) return;
    setProdutosEditados(prev =>
      prev.map(p => p.id === itemId ? { ...p, quantidade: novaQtd } : p)
    );
  };

  const handleSalvar = async () => {
    setSalvando(true);
    try {
      // 1. REMOVER produtos marcados
      if (produtosParaRemover.size > 0) {
        const { error: deleteError } = await supabase
          .from('listas_compras_itens')
          .delete()
          .in('id', Array.from(produtosParaRemover));
        
        if (deleteError) throw deleteError;
      }

      // 2. ATUALIZAR APENAS quantidades (NÃO unidades)
      for (const produto of produtosEditados) {
        const original = lista.listas_compras_itens.find(p => p.id === produto.id);
        
        if (original && original.quantidade !== produto.quantidade) {
          const { error: updateError } = await supabase
            .from('listas_compras_itens')
            .update({ quantidade: produto.quantidade })
            .eq('id', produto.id);
          
          if (updateError) throw updateError;
        }
      }

      // 3. ADICIONAR novos produtos (com unidade da normalização)
      if (produtosParaAdicionar.length > 0) {
        const { error: insertError } = await supabase
          .from('listas_compras_itens')
          .insert(produtosParaAdicionar.map(p => ({
            produto_nome: p.produto_nome,
            quantidade: p.quantidade,
            unidade_medida: p.unidade_medida,
            lista_id: lista.id,
            comprado: false,
            produto_id: null
          })));
        
        if (insertError) throw insertError;
      }

      queryClient.invalidateQueries({ queryKey: ['lista-compras', lista.id] });
      queryClient.invalidateQueries({ queryKey: ['comparacao-precos', lista.id] });

      toast({
        title: "✅ Lista atualizada!",
        description: `${produtosParaRemover.size} removidos, ${produtosParaAdicionar.length} adicionados`
      });

      onClose();
    } catch (error: any) {
      console.error('Erro ao salvar:', error);
      toast({
        title: "❌ Erro ao salvar alterações",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setSalvando(false);
    }
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
            Adicione, remova ou edite quantidades de produtos. Unidades de medida vêm da normalização e não podem ser alteradas.
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

          {/* SEÇÃO 2: Produtos temporários a adicionar */}
          {produtosParaAdicionar.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold text-green-600">
                  📦 Produtos a Adicionar ({produtosParaAdicionar.length})
                </Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setProdutosParaAdicionar([])}
                >
                  Limpar Todos
                </Button>
              </div>
              <div className="space-y-2">
                {produtosParaAdicionar.map((p, idx) => (
                  <Card key={idx} className="bg-green-50 border-green-200">
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <p className="font-medium">{p.produto_nome}</p>
                          <p className="text-sm text-muted-foreground">
                            {p.quantidade} {p.unidade_medida}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setProdutosParaAdicionar(prev =>
                            prev.filter((_, i) => i !== idx)
                          )}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          <Separator />

          {/* SEÇÃO 3: Produtos existentes na lista */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">
              📋 Produtos na Lista ({produtosEditados.filter(p => !produtosParaRemover.has(p.id)).length})
            </Label>
            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
              {produtosEditados.map(produto => {
                const marcadoParaRemover = produtosParaRemover.has(produto.id);
                
                return (
                  <Card
                    key={produto.id}
                    className={marcadoParaRemover ? 'opacity-40 bg-red-50 border-red-200' : ''}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-start gap-3">
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center justify-between">
                            <p className={`font-medium ${marcadoParaRemover ? 'line-through' : ''}`}>
                              {produto.produto_nome}
                            </p>
                            {marcadoParaRemover ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleCancelarRemocao(produto.id)}
                              >
                                <Undo2 className="h-4 w-4 mr-1" />
                                Desfazer
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleRemoverExistente(produto.id)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            )}
                          </div>

                          {!marcadoParaRemover && (
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

                              {/* Unidade READ-ONLY */}
                              <Badge variant="secondary" className="h-7 px-2">
                                {produto.unidade_medida}
                              </Badge>
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {produtosParaRemover.size > 0 && (
              <span className="text-red-600">🗑️ {produtosParaRemover.size} para remover</span>
            )}
            {produtosParaAdicionar.length > 0 && (
              <span className="text-green-600 ml-3">➕ {produtosParaAdicionar.length} para adicionar</span>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={salvando}>
              Cancelar
            </Button>
            <Button onClick={handleSalvar} disabled={salvando}>
              {salvando ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Salvar Alterações
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
