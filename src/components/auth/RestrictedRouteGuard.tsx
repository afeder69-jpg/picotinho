import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { useAppConfig } from '@/hooks/useAppConfig';

/**
 * Lista EXPLÍCITA de rotas públicas (whitelist).
 * Qualquer rota fora dessa lista exige login quando `acesso_restrito = true`.
 */
const ROTAS_PUBLICAS = new Set<string>([
  '/',
  '/menu',
  '/auth',
  '/reset-password',
  '/privacy',
  '/terms',
  '/data-deletion',
]);

interface Props {
  children: React.ReactNode;
}

export const RestrictedRouteGuard = ({ children }: Props) => {
  const { user, loading: authLoading } = useAuth();
  const { acessoRestrito, isLoading: configLoading } = useAppConfig();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (authLoading || configLoading) return;
    if (!acessoRestrito) return; // modo aberto: nada a fazer
    if (user) return; // logado: liberado

    if (!ROTAS_PUBLICAS.has(location.pathname)) {
      navigate('/auth', { replace: true });
    }
  }, [authLoading, configLoading, acessoRestrito, user, location.pathname, navigate]);

  return <>{children}</>;
};
