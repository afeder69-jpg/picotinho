import { useState } from "react";
import { Clock, Users, ChefHat, ShoppingCart, Star, ImageIcon, Calendar } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ReceitaDetalhesDialog } from "./ReceitaDetalhesDialog";
import { AdicionarReceitaCardapioDialog } from "./AdicionarReceitaCardapioDialog";

interface ReceitaCardProps {
  receita: {
    id: string;
    titulo: string;
    descricao?: string;
    categoria?: string;
    tempo_preparo?: number;
    tempo_cozimento?: number;
    porcoes?: number;
    favorita?: boolean;
    status_disponibilidade?: string;
    ingredientes_faltantes?: number;
    ingredientes_totais?: number;
    imagem_url?: string;
  };
}

export function ReceitaCard({ receita }: ReceitaCardProps) {
  const [detalhesOpen, setDetalhesOpen] = useState(false);
  const [cardapioDialogOpen, setCardapioDialogOpen] = useState(false);

  const getStatusColor = (status?: string) => {
    switch (status) {
      case "completo":
        return "bg-green-500/10 text-green-600 border-green-500/20";
      case "parcial":
        return "bg-yellow-500/10 text-yellow-600 border-yellow-500/20";
      case "faltando":
        return "bg-red-500/10 text-red-600 border-red-500/20";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const getStatusLabel = (status?: string) => {
    switch (status) {
      case "completo":
        return "Disponível";
      case "parcial":
        return `Faltam ${receita.ingredientes_faltantes} itens`;
      case "faltando":
        return "Indisponível";
      default:
        return "Sem estoque";
    }
  };

  return (
    <>
      <Card
        className="cursor-pointer hover:shadow-md transition-shadow"
        onClick={() => setDetalhesOpen(true)}
      >
        <CardContent className="p-4">
          <div className="flex gap-4">
            {/* Imagem */}
            {receita.imagem_url ? (
              <img
                src={receita.imagem_url}
                alt={receita.titulo}
                className="w-20 h-20 object-cover rounded"
              />
            ) : (
              <div className="w-20 h-20 bg-muted rounded flex items-center justify-center">
                <ImageIcon className="h-8 w-8 text-muted-foreground/50" />
              </div>
            )}

            {/* Conteúdo */}
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold text-lg">{receita.titulo}</h3>
                {receita.favorita && (
                  <Star className="h-4 w-4 fill-yellow-500 text-yellow-500" />
                )}
              </div>
              
              {receita.descricao && (
                <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                  {receita.descricao}
                </p>
              )}

              <div className="flex flex-wrap gap-2 mb-3">
                {receita.categoria && (
                  <Badge variant="outline">
                    <ChefHat className="h-3 w-3 mr-1" />
                    {receita.categoria}
                  </Badge>
                )}
                {receita.tempo_preparo && (
                  <Badge variant="outline">
                    <Clock className="h-3 w-3 mr-1" />
                    {receita.tempo_preparo + (receita.tempo_cozimento || 0)} min
                  </Badge>
                )}
                {receita.porcoes && (
                  <Badge variant="outline">
                    <Users className="h-3 w-3 mr-1" />
                    {receita.porcoes} porções
                  </Badge>
                )}
              </div>

              <div className="flex items-center justify-between">
                <Badge className={getStatusColor(receita.status_disponibilidade)}>
                  {getStatusLabel(receita.status_disponibilidade)}
                </Badge>
                <div className="flex gap-1">
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCardapioDialogOpen(true);
                    }}
                  >
                    <Calendar className="h-4 w-4" />
                  </Button>
                  {receita.status_disponibilidade === "parcial" && (
                    <Button variant="ghost" size="sm">
                      <ShoppingCart className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <ReceitaDetalhesDialog
        receitaId={receita.id}
        open={detalhesOpen}
        onOpenChange={setDetalhesOpen}
      />

      <AdicionarReceitaCardapioDialog
        open={cardapioDialogOpen}
        onOpenChange={setCardapioDialogOpen}
        receitaId={receita.id}
        receitaNome={receita.titulo}
      />
    </>
  );
}
