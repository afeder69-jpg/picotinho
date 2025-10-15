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

  // Buscar custos de todas as receitas
  const { data: custosReceitas } = useQuery({
    queryKey: ['cardapio-custos', id, receitas],
    queryFn: async () => {
      if (!receitas.length) return { total: 0, porDia: {} };
      
      const receitasIds = [...new Set(receitas.map(r => r.receita_id))];
      
      // Buscar custos em paralelo
      const custosPromises = receitasIds.map(async (receitaId) => {
        const { data } = await supabase.functions.invoke('calcular-custo-receita', {
          body: { receitaId }
        });
        return { 
          receitaId, 
          custo: data?.custo_total || 0 
        };
      });
      
      const custos = await Promise.all(custosPromises);
      const custosMap = new Map(custos.map(c => [c.receitaId, c.custo]));
      
      // Calcular custo por dia
      const porDia: Record<number, number> = {};
      receitas.forEach(receita => {
        const custoPorReceita = custosMap.get(receita.receita_id) || 0;
        porDia[receita.dia_semana] = (porDia[receita.dia_semana] || 0) + custoPorReceita;
      });
      
      // Calcular total geral
      const total = Object.values(porDia).reduce((sum, valor) => sum + valor, 0);
      
      return { total, porDia };
    },
    enabled: receitas.length > 0 && !!user,
    staleTime: 5 * 60 * 1000,
  });

  const handleGerarListaCompras = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('gerar-lista-otimizada', {
        body: {
          userId: user?.id,
          origem: 'cardapio',
          cardapioId: id,
          titulo: `Lista: ${cardapio?.titulo}`
        }
      });

      if (error) throw error;

      toast({ title: "Lista criada com sucesso!" });
      navigate(`/lista-compras/${data.listaId}`);
    } catch (error) {
      console.error('Erro ao criar lista:', error);
      toast({ 
        title: "Erro ao criar lista",
        description: "Tente novamente mais tarde",
        variant: "destructive" 
      });
    }
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

  const dataInicio = new Date(cardapio.semana_inicio + 'T12:00:00');
  const dataFim = new Date(cardapio.semana_fim + 'T12:00:00');
  
  // Calcular número real de dias entre as datas
  const totalDias = Math.ceil((dataFim.getTime() - dataInicio.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  
  const dias = Array.from({ length: totalDias }, (_, i) => ({
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
              <h1 className="text-2xl font-bold">
                {cardapio.titulo}
                {custosReceitas?.total !== undefined && custosReceitas.total > 0 && (
                  <span className="text-lg text-primary ml-3">
                    💰 R$ {custosReceitas.total.toFixed(2)}
                  </span>
                )}
              </h1>
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
          <div className={totalDias <= 3 ? '' : 'min-w-[1400px]'}>
            {/* Cabeçalho dos Dias */}
            <div className={`grid gap-2 mb-2`} style={{ gridTemplateColumns: `repeat(${totalDias}, minmax(0, 1fr))` }}>
              {dias.map(({ data, diaSemana }) => {
                const custoDia = custosReceitas?.porDia?.[diaSemana] || 0;
                
                return (
                  <div key={diaSemana} className="text-center space-y-1">
                    <div className="font-semibold">
                      {format(data, 'EEEE', { locale: ptBR })}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {format(data, 'dd/MM', { locale: ptBR })}
                    </div>
                    {custoDia > 0 && (
                      <div className="text-xs font-medium text-primary">
                        💰 R$ {custoDia.toFixed(2)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Grid de Refeições */}
            {refeicoes.map((refeicao, refeicaoIndex) => (
              <div key={refeicao} className="mb-6">
                <h3 className="text-lg font-semibold mb-3 px-2">{refeicao}</h3>
                <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${totalDias}, minmax(0, 1fr))` }}>
                  {dias.map(({ diaSemana }) => (
                    <DiaCardapio
                      key={`${diaSemana}-${refeicao}`}
                      cardapioId={cardapio.id}
                      diaSemana={diaSemana}
                      refeicao={refeicao}
                      receitasAtuais={receitas.filter(
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
