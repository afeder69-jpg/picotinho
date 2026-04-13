import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
import { formatarUnidadeListaCompras } from "@/lib/utils";
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface EditarQuantidadeDialogProps {
  open: boolean;
  onClose: () => void;
  item: {
    id: string;
    produto_nome: string;
    quantidade: number;
    unidade_medida: string;
  } | null;
  onSalvar: (id: string, quantidade: number) => void;
}

export function EditarQuantidadeDialog({ open, onClose, item, onSalvar }: EditarQuantidadeDialogProps) {
  const [quantidade, setQuantidade] = useState(item?.quantidade || 1);

  // Sync when item changes
  const [prevItemId, setPrevItemId] = useState<string | null>(null);
  if (item && item.id !== prevItemId) {
    setPrevItemId(item.id);
    setQuantidade(item.quantidade);
  }

  if (!item) return null;

  const handleSalvar = () => {
    if (quantidade > 0) {
      onSalvar(item.id, quantidade);
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle className="text-base">Editar quantidade</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-sm text-muted-foreground truncate">{item.produto_nome}</p>

          <div className="flex items-center justify-center gap-3">
            <Button
              size="icon"
              variant="outline"
              className="h-10 w-10"
              onClick={() => setQuantidade(Math.max(1, quantidade - 1))}
              disabled={quantidade <= 1}
            >
              <Minus className="h-4 w-4" />
            </Button>
            <Input
              type="number"
              value={quantidade}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (v > 0) setQuantidade(v);
              }}
              className="w-20 h-10 text-center text-lg font-semibold"
              min="1"
            />
            <Button
              size="icon"
              variant="outline"
              className="h-10 w-10"
              onClick={() => setQuantidade(quantidade + 1)}
            >
              <Plus className="h-4 w-4" />
            </Button>
            <span className="text-sm text-muted-foreground">{formatarUnidadeListaCompras(item.unidade_medida)}</span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSalvar}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
