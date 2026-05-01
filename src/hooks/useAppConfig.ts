import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Hook que lê configurações globais da tabela `app_config`.
 * - Cache de 5 minutos
 * - Default seguro: em caso de erro, assume `acesso_restrito = true`
 *   (preferimos bloquear demais a liberar demais).
 */
export function useAppConfig() {
  const { data, isLoading } = useQuery({
    queryKey: ['app_config', 'acesso_restrito'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_config')
        .select('valor')
        .eq('chave', 'acesso_restrito')
        .maybeSingle();

      if (error) {
        console.warn('[useAppConfig] erro ao ler acesso_restrito:', error);
        return { acessoRestrito: true };
      }

      // valor é jsonb (true/false)
      const acessoRestrito = data?.valor === true || (data?.valor as any) === 'true';
      return { acessoRestrito };
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 1,
  });

  return {
    acessoRestrito: data?.acessoRestrito ?? true,
    isLoading,
  };
}
