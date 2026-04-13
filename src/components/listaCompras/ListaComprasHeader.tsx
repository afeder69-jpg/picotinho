import { ArrowLeft, FileText, Share2, Trash2, Pencil, DollarSign, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface ListaComprasHeaderProps {
  lista: {
    titulo: string;
    origem: string;
  };
  totalProdutos: number;
  onVoltar: () => void;
  onVerTabela: () => void;
  onExportar: () => void;
  onEditar?: () => void;
  onLimpar?: () => void;
  onCarregarPrecos?: () => void;
  precosCarregados?: boolean;
  loadingPrecos?: boolean;
  loading?: boolean;
}

export function ListaComprasHeader({ 
  lista, 
  totalProdutos,
  onVoltar, 
  onVerTabela, 
  onExportar,
  onEditar,
  onLimpar,
  onCarregarPrecos,
  precosCarregados = false,
  loadingPrecos = false,
  loading = false
}: ListaComprasHeaderProps) {
  const origemLabel = {
    manual: 'Manual',
    receita: 'Receita',
    cardapio: 'Cardápio'
  }[lista.origem] || 'Outro';

  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onVoltar}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">{lista.titulo}</h1>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="secondary">{origemLabel}</Badge>
            <span>• {totalProdutos} produtos</span>
          </div>
        </div>
      </div>
      
      <div className="flex items-center gap-2">
        {onEditar && (
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => {
              console.log('🖊️ Botão Editar clicado!');
              onEditar();
            }}
            disabled={loading}
          >
            <Pencil className="mr-2 h-4 w-4" />
            <span className="hidden sm:inline">Editar</span>
          </Button>
        )}

        {/* Botão Preços: visível apenas quando preços não foram carregados */}
        {!precosCarregados && onCarregarPrecos && (
          <Button 
            variant="outline" 
            size="sm" 
            onClick={onCarregarPrecos}
            disabled={loadingPrecos}
          >
            {loadingPrecos ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <DollarSign className="mr-2 h-4 w-4" />
            )}
            <span>Preços</span>
          </Button>
        )}

        {/* Tabela e Exportar: visíveis apenas quando preços estão carregados */}
        {precosCarregados && (
          <>
            <Button variant="outline" size="sm" onClick={onVerTabela} disabled={loading}>
              <FileText className="mr-2 h-4 w-4" />
              <span className="hidden sm:inline">Tabela</span>
            </Button>
            <Button variant="outline" size="sm" onClick={onExportar} disabled={loading}>
              <Share2 className="mr-2 h-4 w-4" />
              <span className="hidden sm:inline">Exportar</span>
            </Button>
          </>
        )}

        {onLimpar && (
          <Button variant="outline" size="sm" onClick={onLimpar} disabled={loading}>
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
