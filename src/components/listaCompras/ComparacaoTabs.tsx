import { Sparkles, Store } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface ComparacaoTabsProps {
  tabAtiva: string;
  onTabChange: (tab: string) => void;
  mercados: Array<{
    id: string;
    nome: string;
    total: number;
  }>;
}

export function ComparacaoTabs({ tabAtiva, onTabChange, mercados = [] }: ComparacaoTabsProps) {
  const mercadosLimitados = mercados.slice(0, 3);
  const totalTabs = 1 + mercadosLimitados.length;

  return (
    <Tabs value={tabAtiva} onValueChange={onTabChange} className="w-full">
      <TabsList className={`grid w-full grid-cols-${totalTabs}`}>
        <TabsTrigger value="otimizado" className="flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          <span className="hidden sm:inline">Otimizado</span>
          <span className="sm:hidden">Opt</span>
        </TabsTrigger>
        {mercadosLimitados.map((mercado, i) => {
          const label = String.fromCharCode(65 + i);
          return (
            <TabsTrigger 
              key={mercado.id} 
              value={`mercado${label}`}
              className="flex items-center gap-2"
            >
              <Store className="h-4 w-4" />
              <span className="hidden sm:inline">{mercado.nome}</span>
              <span className="sm:hidden">{label}</span>
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
}