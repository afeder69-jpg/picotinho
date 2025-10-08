import { useState } from "react";
import { Plus, Search, Filter, ChefHat, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ReceitasList } from "@/components/receitas/ReceitasList";
import { ReceitaDialog } from "@/components/receitas/ReceitaDialog";
import { BuscarReceitasApi } from "@/components/receitas/BuscarReceitasApi";

export default function Receitas() {
  const [searchTerm, setSearchTerm] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [apiDialogOpen, setApiDialogOpen] = useState(false);
  const [selectedTab, setSelectedTab] = useState("todas");

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <div className="bg-gradient-to-br from-primary to-primary-glow p-6 text-primary-foreground">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <ChefHat className="h-8 w-8" />
            <h1 className="text-2xl font-bold">Receitas</h1>
          </div>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setApiDialogOpen(true)}
              className="text-primary-foreground hover:bg-white/10"
            >
              <Globe className="h-4 w-4 mr-2" />
              Buscar Online
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setDialogOpen(true)}
            >
              <Plus className="h-4 w-4 mr-2" />
              Nova
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar receitas..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 bg-background/10 border-white/20 text-primary-foreground placeholder:text-primary-foreground/60"
          />
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        <Tabs value={selectedTab} onValueChange={setSelectedTab}>
          <TabsList className="w-full grid grid-cols-4 mb-4">
            <TabsTrigger value="todas">Todas</TabsTrigger>
            <TabsTrigger value="completo">Disponíveis</TabsTrigger>
            <TabsTrigger value="parcial">Parciais</TabsTrigger>
            <TabsTrigger value="favoritas">Favoritas</TabsTrigger>
          </TabsList>

          <TabsContent value="todas">
            <ReceitasList filtro="todas" searchTerm={searchTerm} />
          </TabsContent>
          <TabsContent value="completo">
            <ReceitasList filtro="completo" searchTerm={searchTerm} />
          </TabsContent>
          <TabsContent value="parcial">
            <ReceitasList filtro="parcial" searchTerm={searchTerm} />
          </TabsContent>
          <TabsContent value="favoritas">
            <ReceitasList filtro="favoritas" searchTerm={searchTerm} />
          </TabsContent>
        </Tabs>
      </div>

      {/* Dialogs */}
      <ReceitaDialog open={dialogOpen} onOpenChange={setDialogOpen} />
      <BuscarReceitasApi open={apiDialogOpen} onOpenChange={setApiDialogOpen} />
    </div>
  );
}
