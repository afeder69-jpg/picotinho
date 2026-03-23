import { useState, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, ShoppingCart } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { toast } from 'sonner';
import { formatarNomeParaExibicao } from '@/lib/utils';

interface ProdutoMaster {
  id: string;
  nome_padrao: string;
  unidade_base: string | null;
}

interface AdicionarListaDialogProps {
  open: boolean;
  onClose: () => void;
  produto: ProdutoMaster | null;
}

interface Lista {
  id: string;
  titulo: string;
}

const AdicionarListaDialog = ({ open, onClose, produto }: AdicionarListaDialogProps) => {
  const { user } = useAuth();
  const [listas, setListas] = useState<Lista[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [adicionando, setAdicionando] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !user) return;

    const fetchListas = async () => {
      setCarregando(true);
      const { data } = await supabase
        .from('listas_compras')
        .select('id, titulo')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      setListas(data || []);
      setCarregando(false);
    };

    fetchListas();
  }, [open, user]);

  const handleAdicionar = async (listaId: string) => {
    if (!produto) return;

    setAdicionando(listaId);
    try {
      const { error } = await supabase.from('listas_compras_itens').insert({
        lista_id: listaId,
        produto_nome: produto.nome_padrao,
        produto_id: produto.id,
        quantidade: 1,
        unidade_medida: produto.unidade_base || 'UN',
        comprado: false,
      });

      if (error) throw error;

      toast.success(`${formatarNomeParaExibicao(produto.nome_padrao)} adicionado à lista!`);
      onClose();
    } catch (err) {
      console.error('Erro ao adicionar à lista:', err);
      toast.error('Erro ao adicionar produto à lista');
    } finally {
      setAdicionando(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Adicionar à Lista</DialogTitle>
          <DialogDescription>
            {produto
              ? `Escolha a lista para adicionar "${formatarNomeParaExibicao(produto.nome_padrao)}"`
              : 'Selecione uma lista'}
          </DialogDescription>
        </DialogHeader>

        {carregando ? (
          <div className="flex justify-center py-6">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : listas.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground text-sm">
            Nenhuma lista de compras encontrada. Crie uma lista primeiro.
          </div>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {listas.map((lista) => (
              <Button
                key={lista.id}
                variant="outline"
                className="w-full justify-start"
                disabled={adicionando === lista.id}
                onClick={() => handleAdicionar(lista.id)}
              >
                {adicionando === lista.id ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <ShoppingCart className="w-4 h-4 mr-2" />
                )}
                {lista.titulo}
              </Button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default AdicionarListaDialog;
