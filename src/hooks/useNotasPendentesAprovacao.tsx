import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';

export interface NotaPendente {
  id: string;
  dados_extraidos: any;
  nome_original: string | null;
  created_at: string;
}

export function useNotasPendentesAprovacao() {
  const { user } = useAuth();
  
  return useQuery<NotaPendente[]>({
    queryKey: ['notas-pendentes-aprovacao', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      
      const { data, error } = await supabase
        .from('notas_imagens')
        .select('id, dados_extraidos, nome_original, created_at')
        .eq('usuario_id', user.id)
        .eq('status_aprovacao', 'pendente_aprovacao')
        .order('created_at', { ascending: false });
        
      if (error) {
        console.error('Erro ao buscar notas pendentes:', error);
        throw error;
      }
      
      console.log(`📬 Polling: ${data?.length || 0} notas pendentes`);
      return data || [];
    },
    enabled: !!user?.id,
    refetchInterval: 3000, // Polling a cada 3 segundos
    refetchIntervalInBackground: true, // Continua mesmo se app em background
    staleTime: 0, // Sempre buscar dados frescos
  });
}
