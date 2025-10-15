import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SeletorProdutoNormalizado } from "@/components/receitas/SeletorProdutoNormalizado";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { toast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";

interface CriarListaDialogProps {
  open: boolean;
  onClose: () => void;
}

export function CriarListaDialog({ open, onClose }: CriarListaDialogProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [titulo, setTitulo] = useState('');
  const [produtos, setProdutos] = useState<Array<{
    produto_nome: string;
    quantidade: number;
    unidade_medida: string;
  }>>([]);
  const [criando, setCriando] = useState(false);

  const handleAdicionarProduto = (produto: any, quantidade: number, unidade: string) => {
    setProdutos(prev => [...prev, {
      produto_nome: produto.nome_padrao,
      quantidade,
      unidade_medida: unidade
    }]);
  };

  const handleRemoverProduto = (index: number) => {
    setProdutos(prev => prev.filter((_, i) => i !== index));
  };

  const handleCriar = async () => {
    if (!titulo.trim()) {
      toast({ title: "Digite um título para a lista", variant: "destructive" });
      return;
    }

    if (produtos.length === 0) {
      toast({ title: "Adicione pelo menos um produto", variant: "destructive" });
      return;
    }

    setCriando(true);
    try {
      const { data, error } = await supabase.functions.invoke('gerar-lista-otimizada', {
        body: {
          userId: user?.id,
          origem: 'manual',
          titulo,
          produtosManuais: produtos
        }
      });

      if (error) throw error;

      toast({ title: "Lista criada com sucesso!" });
      onClose();
      navigate(`/lista-compras/${data.listaId}`);
    } catch (error) {
      console.error('Erro ao criar lista:', error);
      toast({ title: "Erro ao criar lista", variant: "destructive" });
    } finally {
      setCriando(false);
    }
  };

  const handleClose = () => {
    setTitulo('');
    setProdutos([]);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>🛒 Nova Lista de Compras</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div>
            <Label htmlFor="titulo">Título da Lista</Label>
            <Input
              id="titulo"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex: Compras da Semana"
            />
          </div>

          <div>
            <Label>Adicionar Produtos</Label>
            <SeletorProdutoNormalizado onAdicionar={handleAdicionarProduto} />
          </div>

          {produtos.length > 0 && (
            <div>
              <Label>Produtos Adicionados ({produtos.length})</Label>
              <div className="space-y-2 mt-2">
                {produtos.map((produto, index) => (
                  <div key={index} className="flex items-center justify-between p-2 bg-muted rounded">
                    <span className="text-sm">
                      {produto.produto_nome} - {produto.quantidade} {produto.unidade_medida}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoverProduto(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancelar
          </Button>
          <Button onClick={handleCriar} disabled={criando || !titulo || produtos.length === 0}>
            <Plus className="mr-2 h-4 w-4" />
            {criando ? 'Criando...' : 'Criar Lista'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}