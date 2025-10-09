import { useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Download, Loader2, Tags } from "lucide-react";

export function ImportarReceitasBrasileiras() {
  const [importing, setImporting] = useState(false);
  const [generating, setGenerating] = useState(false);

  const handleImport = async () => {
    setImporting(true);
    try {
      const { data, error } = await supabase.functions.invoke('importar-receitas-json');
      
      if (error) throw error;
      
      if (data.importacao_ja_realizada) {
        toast.info(data.message, {
          description: `Total de receitas no banco: ${data.total_banco}`
        });
      } else {
        toast.success(data.message, {
          description: `${data.total_importadas} receitas brasileiras importadas!`
        });
      }
    } catch (error: any) {
      console.error('Erro ao importar receitas:', error);
      toast.error("Erro ao importar receitas", {
        description: error.message
      });
    } finally {
      setImporting(false);
    }
  };

  const handleGenerateTags = async () => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('gerar-categorias-tags-receitas');
      
      if (error) throw error;
      
      toast.success(data.message, {
        description: `${data.processadas} receitas atualizadas!`
      });
    } catch (error: any) {
      console.error('Erro ao gerar tags:', error);
      toast.error("Erro ao gerar categorias e tags", {
        description: error.message
      });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="flex gap-2">
      <Button
        onClick={handleImport}
        disabled={importing}
        variant="outline"
        size="sm"
        className="gap-2"
      >
        {importing ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Importando...
          </>
        ) : (
          <>
            <Download className="h-4 w-4" />
            🇧🇷 Importar
          </>
        )}
      </Button>
      
      <Button
        onClick={handleGenerateTags}
        disabled={generating}
        variant="outline"
        size="sm"
        className="gap-2"
      >
        {generating ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Gerando...
          </>
        ) : (
          <>
            <Tags className="h-4 w-4" />
            Gerar Tags
          </>
        )}
      </Button>
    </div>
  );
}
