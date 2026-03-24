import { useState, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, ShoppingCart, Plus } from 'lucide-react';
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
  const [novaLista, setNovaLista] = useState('');
  const [criandoNova, setCriandoNova] = useState(false);

  useEffect(() => {
    if (!open || !user) return;
    setNovaLista('');

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

  const inserirProdutoNaLista = async (listaId: string) => {
    if (!produto) return;
    const { error } = await supabase.from('listas_compras_itens').insert({
      lista_id: listaId,
      produto_nome: produto.nome_padrao,
      produto_id: produto.id,
      quantidade: 1,
      unidade_medida: produto.unidade_base || 'UN',
      comprado: false,
    });
    if (error) throw error;
  };

  const handleAdicionar = async (listaId: string) => {
    if (!produto) return;
    setAdicionando(listaId);
    try {
      await inserirProdutoNaLista(listaId);
      toast.success(`${formatarNomeParaExibicao(produto.nome_padrao)} adicionado à lista!`);
      onClose();
    } catch (err) {
      console.error('Erro ao adicionar à lista:', err);
      toast.error('Erro ao adicionar produto à lista');
    } finally {
      setAdicionando(null);
    }
  };

  const handleCriarEAdicionar = async () => {
    if (!produto || !user || !novaLista.trim()) return;
    setCriandoNova(true);
    try {
      const { data: lista, error: erroLista } = await supabase
        .from('listas_compras')
        .insert({ titulo: novaLista.trim(), user_id: user.id, origem: 'manual' })
        .select('id')
        .single();

      if (erroLista || !lista) throw erroLista;

      await inserirProdutoNaLista(lista.id);
      toast.success(`Lista "${novaLista.trim()}" criada com ${formatarNomeParaExibicao(produto.nome_padrao)}!`);
      onClose();
    } catch (err) {
      console.error('Erro ao criar lista:', err);
      toast.error('Erro ao criar lista');
    } finally {
      setCriandoNova(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Adicionar à Lista</DialogTitle>
          <DialogDescription>
            {produto
              ? `Escolha uma lista ou crie uma nova para "${formatarNomeParaExibicao(produto.nome_padrao)}"`
              : 'Selecione uma lista'}
          </DialogDescription>
        </DialogHeader>

        {/* Criar nova lista */}
        <div className="flex gap-2">
          <Input
            value={novaLista}
            onChange={(e) => setNovaLista(e.target.value)}
            placeholder="Nome da nova lista..."
            maxLength={100}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && novaLista.trim()) {
                e.preventDefault();
                handleCriarEAdicionar();
              }
            }}
          />
          <Button
            size="sm"
            disabled={!novaLista.trim() || criandoNova}
            onClick={handleCriarEAdicionar}
            className="shrink-0"
          >
            {criandoNova ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
          </Button>
        </div>

        {/* Listas existentes */}
        {carregando ? (
          <div className="flex justify-center py-4">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : listas.length > 0 ? (
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
        ) : (
          <p className="text-center text-sm text-muted-foreground py-2">
            Nenhuma lista existente. Crie uma acima!
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default AdicionarListaDialog;
