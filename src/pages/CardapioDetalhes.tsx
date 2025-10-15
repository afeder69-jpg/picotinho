import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, ShoppingCart } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { DiaCardapio } from "@/components/cardapio/DiaCardapio";
import { format, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "@/hooks/use-toast";

export default function CardapioDetalhes() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: cardapio, isLoading } = useQuery({
    queryKey: ['cardapio', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cardapios')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id
  });

  const { data: receitas = [], refetch } = useQuery({
    queryKey: ['cardapio-receitas', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cardapio_receitas')
        .select(`
          *,
          receitas(*)
        `)
        .eq('cardapio_id', id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!id
  });

  const handleGerarListaCompras = async () => {
    toast({
      title: "Gerando lista de compras...",
      description: "Esta funcionalidade será implementada em breve"
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex items-center justify-center">
        <div className="text-center">
          <div className="h-16 w-16 bg-muted animate-pulse rounded-full mx-auto mb-4" />
          <p className="text-muted-foreground">Carregando cardápio...</p>
        </div>
      </div>
    );
  }

  if (!cardapio) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground">Cardápio não encontrado</p>
          <Button onClick={() => navigate('/cardapios')} className="mt-4">
            Voltar
          </Button>
        </div>
      </div>
    );
  }

  const dataInicio = new Date(cardapio.semana_inicio);
  const dias = Array.from({ length: 7 }, (_, i) => ({
    data: addDays(dataInicio, i),
    diaSemana: i + 1
  }));

  const refeicoes = ['Café da Manhã', 'Almoço', 'Jantar', 'Lanche'];

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <div className="container max-w-7xl mx-auto p-4 space-y-6 pb-24">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/cardapios')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">{cardapio.titulo}</h1>
              <p className="text-sm text-muted-foreground">
                {format(new Date(cardapio.semana_inicio), "d 'de' MMMM", { locale: ptBR })} até{' '}
                {format(new Date(cardapio.semana_fim), "d 'de' MMMM 'de' yyyy", { locale: ptBR })}
              </p>
            </div>
          </div>
          <Button onClick={handleGerarListaCompras}>
            <ShoppingCart className="mr-2 h-4 w-4" />
            Gerar Lista de Compras
          </Button>
        </div>

        {/* Grid Semanal */}
        <div className="overflow-x-auto">
          <div className="min-w-[1400px]">
            {/* Cabeçalho dos Dias */}
            <div className="grid grid-cols-7 gap-2 mb-2">
              {dias.map(({ data, diaSemana }) => (
                <div key={diaSemana} className="text-center">
                  <div className="font-semibold">
                    {format(data, 'EEEE', { locale: ptBR })}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {format(data, 'dd/MM', { locale: ptBR })}
                  </div>
                </div>
              ))}
            </div>

            {/* Grid de Refeições */}
            {refeicoes.map((refeicao, refeicaoIndex) => (
              <div key={refeicao} className="mb-6">
                <h3 className="text-lg font-semibold mb-3 px-2">{refeicao}</h3>
                <div className="grid grid-cols-7 gap-2">
                  {dias.map(({ diaSemana }) => (
                    <DiaCardapio
                      key={`${diaSemana}-${refeicao}`}
                      cardapioId={cardapio.id}
                      diaSemana={diaSemana}
                      refeicao={refeicao}
                      receitaAtual={receitas.find(
                        r => r.dia_semana === diaSemana && r.refeicao === refeicao
                      )}
                      onSuccess={refetch}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
