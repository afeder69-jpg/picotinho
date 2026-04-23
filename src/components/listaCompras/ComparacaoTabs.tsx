import { Sparkles, Store } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface MercadoTab {
  id: string;
  nome: string;
  total: number;
  produtos?: Array<unknown>;
}

interface ComparacaoTabsProps {
  tabAtiva: string;
  onTabChange: (tab: string) => void;
  mercados: MercadoTab[];
  comparacao?: Record<string, { id: string; total: number; produtos?: Array<unknown> }>;
}

const formatBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const truncar = (s: string, n = 24) =>
  s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;

export function ComparacaoTabs({
  tabAtiva,
  onTabChange,
  mercados = [],
  comparacao = {},
}: ComparacaoTabsProps) {
  // Mapear cada mercado para a chave correspondente em `comparacao` (mercadoA/B/C…)
  // e filtrar apenas os que têm produtos com preço para esta lista.
  const tabsMercados = mercados
    .map((mercado, idxOriginal) => {
      const labelOriginal = String.fromCharCode(65 + idxOriginal);
      const chave = `mercado${labelOriginal}`;
      const dados = comparacao[chave];
      const produtosCount = dados?.produtos?.length ?? 0;
      const total = dados?.total ?? mercado.total ?? 0;
      return {
        chave,
        nome: mercado.nome,
        total,
        produtosCount,
      };
    })
    .filter((m) => m.produtosCount > 0)
    // Menor total primeiro (decisão de compra mais útil)
    .sort((a, b) => a.total - b.total);

  return (
    <Tabs value={tabAtiva} onValueChange={onTabChange} className="w-full">
      <TabsList
        className="w-full justify-start overflow-x-auto flex-nowrap h-auto p-1 gap-1
                   [scrollbar-width:thin]"
      >
        <TabsTrigger
          value="otimizado"
          className="flex-shrink-0 flex flex-col items-start gap-0.5 px-3 py-2 h-auto"
        >
          <span className="flex items-center gap-1.5 text-sm font-medium">
            <Sparkles className="h-4 w-4" />
            Otimizado
          </span>
        </TabsTrigger>

        {tabsMercados.map((m) => (
          <TabsTrigger
            key={m.chave}
            value={m.chave}
            title={m.nome}
            className="flex-shrink-0 flex flex-col items-start gap-0.5 px-3 py-2 h-auto"
          >
            <span className="flex items-center gap-1.5 text-sm font-medium">
              <Store className="h-4 w-4" />
              {truncar(m.nome)}
            </span>
            <span className="text-xs text-muted-foreground font-normal">
              {formatBRL(m.total)}
            </span>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
