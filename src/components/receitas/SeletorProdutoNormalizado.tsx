import { useState, useEffect } from "react";
import { Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";

interface SeletorProdutoNormalizadoProps {
  onAdicionar: (produto: any, quantidade: number, unidade: string) => void;
}

export function SeletorProdutoNormalizado({ onAdicionar }: SeletorProdutoNormalizadoProps) {
  const [termoBusca, setTermoBusca] = useState('');
  const [sugestoes, setSugestoes] = useState<any[]>([]);
  const [produtoSelecionado, setProdutoSelecionado] = useState<any | null>(null);
  const [quantidade, setQuantidade] = useState<number>(1);
  const [unidade, setUnidade] = useState<string>('');

  useEffect(() => {
    if (termoBusca.length < 2) {
      setSugestoes([]);
      return;
    }

    const timer = setTimeout(async () => {
      // Detectar busca multi-termo com ';'
      const termos = termoBusca.split(';').map(t => t.trim()).filter(t => t.length > 0);
      
      if (termos.length === 0) {
        setSugestoes([]);
        return;
      }

      // Construir query base
      let query = supabase
        .from('produtos_master_global')
        .select('id, nome_padrao, nome_base, categoria, qtd_unidade, granel, categoria_unidade')
        .eq('status', 'ativo');

      // Para cada termo, aplicar busca inteligente por palavras-chave
      termos.forEach(termo => {
        // Extrair palavras-chave (> 2 caracteres, max 4 palavras)
        const palavras = termo
          .toUpperCase()
          .split(/\s+/)
          .filter(p => p.length > 2)
          .slice(0, 4);

        // Cada palavra deve estar presente em nome_padrao OU nome_base
        palavras.forEach(palavra => {
          query = query.or(`nome_padrao.ilike.%${palavra}%,nome_base.ilike.%${palavra}%`);
        });
      });

      const { data } = await query.limit(10);
      setSugestoes(data || []);
    }, 300); // Reduzido de 500ms para 300ms

    return () => clearTimeout(timer);
  }, [termoBusca]);

  const handleSelecionarProduto = (produto: any) => {
    setProdutoSelecionado(produto);
    setUnidade(produto.categoria_unidade || 'Un');
    setTermoBusca(produto.nome_padrao);
    setSugestoes([]);
  };

  const handleAdicionar = () => {
    if (!produtoSelecionado || quantidade <= 0) return;

    onAdicionar(produtoSelecionado, quantidade, unidade);
    
    // Resetar
    setProdutoSelecionado(null);
    setTermoBusca('');
    setQuantidade(1);
    setUnidade('');
  };

  return (
    <div className="space-y-4 border p-4 rounded-md">
      <div>
        <Label>Buscar Produto Normalizado</Label>
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            value={termoBusca}
            onChange={(e) => setTermoBusca(e.target.value)}
            placeholder="Digite o nome (ex: biscoito; maizena para múltiplos termos)"
            className="pl-10"
          />
        </div>
        
        {/* Indicador de busca multi-termo */}
        {termoBusca.includes(';') && (
          <div className="mt-1 text-xs text-muted-foreground">
            🔍 Buscando {termoBusca.split(';').length} termo(s)
          </div>
        )}
        
        {/* Dropdown de sugestões */}
        {sugestoes.length > 0 && (
          <Command className="mt-2 border rounded-md">
            <CommandList>
              <CommandEmpty>Nenhum produto encontrado</CommandEmpty>
              <CommandGroup>
                {sugestoes.map(produto => (
                  <CommandItem
                    key={produto.id}
                    onSelect={() => handleSelecionarProduto(produto)}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span>{produto.nome_padrao}</span>
                      <Badge variant="secondary">{produto.categoria}</Badge>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        )}
      </div>

      {produtoSelecionado && (
        <div className="grid grid-cols-3 gap-2">
          <div>
            <Label>Quantidade</Label>
            <Input
              type="number"
              min="0.01"
              step="0.01"
              value={quantidade}
              onChange={(e) => setQuantidade(parseFloat(e.target.value))}
            />
          </div>
          <div>
            <Label>Unidade</Label>
            <Input
              value={unidade}
              onChange={(e) => setUnidade(e.target.value)}
            />
          </div>
          <div className="flex items-end">
            <Button onClick={handleAdicionar} className="w-full">
              Adicionar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
