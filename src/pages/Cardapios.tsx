import { useState } from "react";
import { Plus, Calendar, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardapiosList } from "@/components/receitas/CardapiosList";
import { CardapioDialog } from "@/components/receitas/CardapioDialog";

export default function Cardapios() {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <div className="bg-gradient-to-br from-primary to-primary-glow p-6 text-primary-foreground">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <Calendar className="h-8 w-8" />
            <h1 className="text-2xl font-bold">Cardápios</h1>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setDialogOpen(true)}
          >
            <Plus className="h-4 w-4 mr-2" />
            Novo Cardápio
          </Button>
        </div>
        <p className="text-sm text-primary-foreground/80">
          Planeje suas refeições semanais
        </p>
      </div>

      {/* Content */}
      <div className="p-4">
        <CardapiosList />
      </div>

      {/* Create Dialog */}
      <CardapioDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
