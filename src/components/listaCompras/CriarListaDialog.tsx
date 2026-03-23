import { useState } from "react";
import { Plus, X, MessageSquare } from "lucide-react";
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

interface ProdutoLista {
  produto_nome: string;
  produto_id: string | null;
  quantidade: number;
  unidade_medida: string;
  item_livre: boolean;
}

export function CriarListaDialog({ open, onClose }: CriarListaDialogProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [titulo, setTitulo] = useState('');
  const [produtos, setProdutos] = useState<ProdutoLista[]>([]);
  const [criando, setCriando] = useState(false);
  const [textoLivre, setTextoLivre] = useState('');

  const handleAdicionarProduto = (produto: any, quantidade: number, unidade: string) => {
    setProdutos(prev => [...prev, {
      produto_nome: produto.nome_padrao,
      produto_id: produto.id || null,
      quantidade,
      unidade_medida: unidade,
      item_livre: false
    }]);
  };

  const handleAdicionarItemLivre = () => {
    const texto = textoLivre.trim();
    if (!texto) {
      toast({ title: "Digite o nome do item", variant: "destructive" });
      return;
    }
    if (texto.length > 200) {
      toast({ title: "Máximo de 200 caracteres", variant: "destructive" });
      return;
    }
    setProdutos(prev => [...prev, {
      produto_nome: texto,
      produto_id: null,
      quantidade: 1,
      unidade_medida: 'UN',
      item_livre: true
    }]);
    setTextoLivre('');
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
          produtosManuais: produtos.map(p => ({
            produto_nome: p.produto_nome,
            produto_id: p.produto_id,
            quantidade: p.quantidade,
            unidade_medida: p.unidade_medida
          }))
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
    setTextoLivre('');
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
            <Label>Adicionar Produtos do Catálogo</Label>
            <SeletorProdutoNormalizado onAdicionar={handleAdicionarProduto} />
          </div>

          <div>
            <Label className="flex items-center gap-1.5">
              <MessageSquare className="h-4 w-4" />
              Adicionar Item Livre
            </Label>
            <p className="text-xs text-muted-foreground mb-2">
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

          {produtos.length > 0 && (
            <div>
              <Label>Produtos Adicionados ({produtos.length})</Label>
              <div className="space-y-2 mt-2">
                {produtos.map((produto, index) => (
                  <div key={index} className="flex items-center justify-between p-2 bg-muted rounded">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">
                        {produto.produto_nome} - {produto.quantidade} {produto.unidade_medida}
                      </span>
                      {produto.item_livre && (
                        <Badge variant="secondary" className="text-xs">
                          Item livre
                        </Badge>
                      )}
                    </div>
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
