import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export const RemoverNotaDuplicada = () => {
  const [loading, setLoading] = useState(false);

  const removerNotaDuplicada = async () => {
    try {
      setLoading(true);
      
      // ID da nota duplicada que precisa ser removida
      const notaId = '116f30ae-593f-44f9-b962-319f93f4427d';
      
      // Obter usuário atual
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Usuário não autenticado');
        return;
      }

      console.log('🗑️ Removendo nota duplicada:', notaId);
      
      const { data, error } = await supabase.functions.invoke('limpar-nota-duplicada', {
        body: {
          notaId: notaId,
          userId: user.id
        }
      });

      if (error) {
        console.error('❌ Erro:', error);
        toast.error('Erro ao remover nota: ' + error.message);
        return;
      }

      console.log('✅ Resposta:', data);
      toast.success('Nota duplicada removida com sucesso! Você pode lançá-la novamente.');
      
    } catch (error) {
      console.error('❌ Erro geral:', error);
      toast.error('Erro ao remover nota duplicada');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4">
      <Button 
        onClick={removerNotaDuplicada}
        disabled={loading}
        variant="destructive"
      >
        {loading ? 'Removendo...' : 'Remover Nota Duplicada (COSTAZUL)'}
      </Button>
      <p className="text-sm text-muted-foreground mt-2">
        Remove a nota COSTAZUL duplicada para permitir novo lançamento
      </p>
    </div>
  );
};