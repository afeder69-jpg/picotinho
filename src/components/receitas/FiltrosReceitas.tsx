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
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('receitas_publicas_brasileiras')
        .select('categoria')
        .not('categoria', 'is', null);

      if (error) throw error;
      
      const categoriasUnicas = Array.from(new Set(data.map(r => r.categoria)))
        .filter(Boolean)
        .sort()
        .map(cat => ({ id: cat, titulo: cat }));
      
      setCategorias(categoriasUnicas);
      console.log('✅ Categorias carregadas:', categoriasUnicas.length);
    } catch (error) {
      console.error('Erro ao carregar categorias:', error);
    } finally {
      setLoading(false);
    }
  };

  const carregarAreas = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('receitas_publicas_brasileiras')
        .select('tags')
        .not('tags', 'is', null);

      if (error) throw error;
      
      // Extrair todas as tags únicas (culinárias)
      const tagsUnicas = new Set<string>();
      data?.forEach(r => {
        if (Array.isArray(r.tags)) {
          r.tags.forEach(tag => tagsUnicas.add(tag));
        }
      });
      
      const areasUnicas = Array.from(tagsUnicas)
        .sort()
        .map(area => ({ id: area, titulo: area }));
      
      setAreas(areasUnicas);
      console.log('✅ Áreas (tags) carregadas:', areasUnicas.length);
    } catch (error) {
      console.error('Erro ao carregar áreas:', error);
    } finally {
      setLoading(false);
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
            {loading ? (
              <div className="text-sm text-muted-foreground p-2">Carregando...</div>
            ) : categorias.length === 0 ? (
              <div className="text-sm text-muted-foreground p-2">Nenhuma categoria disponível</div>
            ) : (
              categorias.map((cat) => (
                <Button
                  key={cat.id}
                  variant="ghost"
                  className="justify-start"
                  onClick={() => onFiltroChange('category', cat.titulo)}
                >
                  {cat.titulo}
                </Button>
              ))
            )}
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
            {loading ? (
              <div className="text-sm text-muted-foreground p-2">Carregando...</div>
            ) : areas.length === 0 ? (
              <div className="text-sm text-muted-foreground p-2">Nenhuma culinária disponível</div>
            ) : (
              areas.map((area) => (
                <Button
                  key={area.id}
                  variant="ghost"
                  size="sm"
                  onClick={() => onFiltroChange('area', area.titulo)}
                >
                  {area.titulo}
                </Button>
              ))
            )}
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
