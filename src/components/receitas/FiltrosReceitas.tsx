import { useState, useEffect } from "react";
import { Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface FiltrosReceitasProps {
  onFiltroChange: (tipo: 'category' | 'area' | 'ingredient', valor: string) => void;
  filtroAtivo?: { tipo: string; valor: string } | null;
}

export function FiltrosReceitas({ onFiltroChange, filtroAtivo }: FiltrosReceitasProps) {
  const [categorias, setCategorias] = useState<any[]>([]);
  const [areas, setAreas] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    carregarCategorias();
    carregarAreas();
  }, []);

  const carregarCategorias = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('buscar-receitas-api', {
        body: { mode: 'categories' }
      });

      if (error) throw error;
      setCategorias(data.receitas || []);
    } catch (error) {
      console.error('Erro ao carregar categorias:', error);
    }
  };

  const carregarAreas = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('buscar-receitas-api', {
        body: { mode: 'areas' }
      });

      if (error) throw error;
      setAreas(data.receitas || []);
    } catch (error) {
      console.error('Erro ao carregar áreas:', error);
    }
  };

  return (
    <div className="flex gap-2 flex-wrap items-center">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <Filter className="h-4 w-4" />
            Por Categoria
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 max-h-96 overflow-y-auto">
          <div className="grid gap-2">
            {categorias.map((cat) => (
              <Button
                key={cat.id}
                variant="ghost"
                className="justify-start"
                onClick={() => onFiltroChange('category', cat.titulo)}
              >
                {cat.imagem_url && (
                  <img src={cat.imagem_url} alt={cat.titulo} className="w-8 h-8 rounded mr-2" />
                )}
                {cat.titulo}
              </Button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            🌍 Por Culinária
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 max-h-96 overflow-y-auto">
          <div className="grid grid-cols-2 gap-2">
            {areas.map((area) => (
              <Button
                key={area.id}
                variant="ghost"
                size="sm"
                onClick={() => onFiltroChange('area', area.titulo)}
              >
                {area.titulo}
              </Button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {filtroAtivo && (
        <Badge variant="secondary" className="gap-2">
          {filtroAtivo.tipo === 'category' && '📁'}
          {filtroAtivo.tipo === 'area' && '🌍'}
          {filtroAtivo.tipo === 'ingredient' && '🥕'}
          {filtroAtivo.valor}
          <X 
            className="h-3 w-3 cursor-pointer" 
            onClick={() => onFiltroChange(filtroAtivo.tipo as any, '')}
          />
        </Badge>
      )}
    </div>
  );
}
