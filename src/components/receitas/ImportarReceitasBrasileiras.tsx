import { useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Download, Loader2 } from "lucide-react";

export function ImportarReceitasBrasileiras() {
  const [importing, setImporting] = useState(false);

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

  return (
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
          🇧🇷 Importar Receitas Brasileiras
        </>
      )}
    </Button>
  );
}
