import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Search, Loader2, ImageOff } from "lucide-react";

interface ScrapingControlsProps {
  totalSemImagem: number;
  totalProcessado: number;
  processando: boolean;
  onBuscarImagens: (batchSize: number, autoAprovar: boolean) => void;
}

export function ScrapingControls({
  totalSemImagem,
  totalProcessado,
  processando,
  onBuscarImagens,
}: ScrapingControlsProps) {
  const [batchSize, setBatchSize] = useState(5);
  const [autoAprovar, setAutoAprovar] = useState(false);

  const batchOptions = [5, 10, 15, 20];
  const progresso = totalSemImagem > 0 ? (totalProcessado / totalSemImagem) * 100 : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ImageOff className="w-5 h-5" />
          Controles de Raspagem
          <Badge variant="secondary">{totalSemImagem} sem foto</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Seletor de Lote */}
        <div className="space-y-2">
          <Label>Processar em lotes de:</Label>
          <div className="flex gap-2">
            {batchOptions.map((size) => (
              <Button
                key={size}
                variant={batchSize === size ? "default" : "outline"}
                size="sm"
                onClick={() => setBatchSize(size)}
                disabled={processando}
                className="flex-1"
              >
                {size}
              </Button>
            ))}
          </div>
        </div>

        {/* Auto-aprovar */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="auto-aprovar">Auto-aprovar resultados</Label>
            <p className="text-xs text-muted-foreground">
              Aprovar automaticamente imagens com confiança ≥ 80%
            </p>
          </div>
          <Switch
            id="auto-aprovar"
            checked={autoAprovar}
            onCheckedChange={setAutoAprovar}
            disabled={processando}
          />
        </div>

        {/* Botão de Busca */}
        <Button
          className="w-full gap-2"
          size="lg"
          onClick={() => onBuscarImagens(batchSize, autoAprovar)}
          disabled={processando || totalSemImagem === 0}
        >
          {processando ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Buscando Imagens...
            </>
          ) : (
            <>
              <Search className="w-4 h-4" />
              Buscar Imagens no Google
            </>
          )}
        </Button>

        {/* Progresso */}
        {totalProcessado > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Progresso</span>
              <span className="font-medium">
                {totalProcessado}/{totalSemImagem} ({progresso.toFixed(0)}%)
              </span>
            </div>
            <Progress value={progresso} className="h-2" />
          </div>
        )}

        {/* Informações */}
        <div className="text-xs text-muted-foreground bg-muted p-3 rounded-lg space-y-1">
          <p>💡 <strong>Dica:</strong> Comece com lotes pequenos (5-10) para testar</p>
          <p>🔍 <strong>Limite:</strong> 100 buscas grátis por dia no Google</p>
          <p>⏱️ <strong>Tempo:</strong> ~2 segundos por produto (rate limiting)</p>
        </div>
      </CardContent>
    </Card>
  );
}
