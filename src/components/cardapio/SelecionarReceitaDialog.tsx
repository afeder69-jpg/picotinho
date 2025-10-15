import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { toast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";

interface SelecionarReceitaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cardapioId: string;
  diaSemana: number;
  refeicao: string;
  receitasJaAdicionadas?: string[];
  onSuccess: () => void;
}

export function SelecionarReceitaDialog({ 
  open, 
  onOpenChange, 
  cardapioId, 
  diaSemana, 
  refeicao,
  receitasJaAdicionadas = [],
  onSuccess 
}: SelecionarReceitaDialogProps) {
  const { user } = useAuth();
  const [busca, setBusca] = useState("");
  const [receitaDuplicada, setReceitaDuplicada] = useState<{
    id: string;
    nome: string;
    dia: string;
    refeicao: string;
  } | null>(null);

  const { data: minhasReceitas = [] } = useQuery({
    queryKey: ['minhas-receitas', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('receitas')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user && open
  });

  const { data: receitasPublicas = [] } = useQuery({
    queryKey: ['receitas-publicas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('receitas')
        .select('*')
        .eq('publica', true)
        .order('media_estrelas', { ascending: false, nullsFirst: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
    enabled: open
  });

  const filtrarReceitas = (receitas: any[]) => {
    if (!busca) return receitas;
    return receitas.filter(r => 
      r.titulo.toLowerCase().includes(busca.toLowerCase())
    );
  };

  const adicionarReceita = async (receitaId: string) => {
    try {
      const { error } = await supabase
        .from('cardapio_receitas')
        .insert([{
          cardapio_id: cardapioId,
          receita_id: receitaId,
          dia_semana: diaSemana,
          refeicao: refeicao
        }]);
      
      if (error) throw error;
      
      toast({ title: "Receita adicionada ao cardápio!" });
      setReceitaDuplicada(null);
      onSuccess();
    } catch (error: any) {
      toast({ 
        title: "Erro ao adicionar", 
        description: error.message, 
        variant: "destructive" 
      });
    }
  };

  const handleSelecionarReceita = async (receitaId: string) => {
    // Verificar se a receita já foi adicionada nesta refeição
    if (receitasJaAdicionadas.includes(receitaId)) {
      // Buscar nome da receita
      const receitaSelecionada = [...minhasReceitas, ...receitasPublicas]
        .find(r => r.id === receitaId);
      
      const nomeReceita = receitaSelecionada?.titulo || 'Esta receita';
      const nomeDia = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 
                       'Quinta-feira', 'Sexta-feira', 'Sábado'][diaSemana];
      
      // Mostrar dialog de confirmação
      setReceitaDuplicada({
        id: receitaId,
        nome: nomeReceita,
        dia: nomeDia,
        refeicao: refeicao.toLowerCase()
      });
      return;
    }

    // Se não é duplicata, adicionar direto
    await adicionarReceita(receitaId);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Selecionar Receita</DialogTitle>
          <DialogDescription>
            Escolha uma receita para adicionar ao {refeicao}
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar receitas..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="pl-10"
          />
        </div>

        <Tabs defaultValue="minhas" className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="minhas">Minhas Receitas</TabsTrigger>
            <TabsTrigger value="publicas">Receitas Públicas</TabsTrigger>
          </TabsList>

          <TabsContent value="minhas" className="flex-1 overflow-y-auto mt-4">
            <div className="grid gap-3 md:grid-cols-2">
              {filtrarReceitas(minhasReceitas).map(receita => (
                <Card 
                  key={receita.id} 
                  className="p-3 cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => handleSelecionarReceita(receita.id)}
                >
                  <div className="flex gap-3">
                    {receita.imagem_url && (
                      <img 
                        src={receita.imagem_url} 
                        alt={receita.titulo}
                        className="w-20 h-20 object-cover rounded"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium line-clamp-2">{receita.titulo}</h4>
                      <div className="flex gap-3 text-xs text-muted-foreground mt-1">
                        {receita.tempo_preparo && <span>{receita.tempo_preparo} min</span>}
                        {receita.porcoes && <span>{receita.porcoes} porções</span>}
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
            {filtrarReceitas(minhasReceitas).length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                Nenhuma receita encontrada
              </div>
            )}
          </TabsContent>

          <TabsContent value="publicas" className="flex-1 overflow-y-auto mt-4">
            <div className="grid gap-3 md:grid-cols-2">
              {filtrarReceitas(receitasPublicas).map(receita => (
                <Card 
                  key={receita.id} 
                  className="p-3 cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => handleSelecionarReceita(receita.id)}
                >
                  <div className="flex gap-3">
                    {receita.imagem_url && (
                      <img 
                        src={receita.imagem_url} 
                        alt={receita.titulo}
                        className="w-20 h-20 object-cover rounded"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium line-clamp-2">{receita.titulo}</h4>
                      <div className="flex gap-3 text-xs text-muted-foreground mt-1">
                        {receita.tempo_preparo && <span>{receita.tempo_preparo} min</span>}
                        {receita.porcoes && <span>{receita.porcoes} porções</span>}
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
            {filtrarReceitas(receitasPublicas).length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                Nenhuma receita encontrada
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>

      <AlertDialog open={!!receitaDuplicada} onOpenChange={() => setReceitaDuplicada(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>⚠️ Receita Duplicada</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>"{receitaDuplicada?.nome}"</strong> já está no{' '}
              {receitaDuplicada?.refeicao} de {receitaDuplicada?.dia}.
              <br /><br />
              Deseja adicionar mesmo assim?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (receitaDuplicada) {
                adicionarReceita(receitaDuplicada.id);
              }
            }}>
              Sim, Adicionar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
