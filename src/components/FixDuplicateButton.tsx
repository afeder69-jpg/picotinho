import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

export const FixDuplicateButton = () => {
  const { toast } = useToast();

  const fixDuplicateIssue = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('fix-duplicate-key-issue', {
        body: { noteId: 'a44ca106-d7e1-4950-adf6-52d973872eb9' }
      });

      if (error) throw error;

      toast({
        title: "Sucesso",
        description: "Problema de duplicata corrigido! Agora você pode reenviar a nota.",
      });
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: "Erro",
        description: "Erro ao corrigir problema",
        variant: "destructive",
      });
    }
  };

  return (
    <Button onClick={fixDuplicateIssue} variant="outline" className="mb-4">
      🔧 Corrigir Problema de Duplicata
    </Button>
  );
};