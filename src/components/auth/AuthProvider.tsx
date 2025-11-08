import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signInAnonymously: () => Promise<void>;
  signOut: () => Promise<void>;
  isTestMode: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isTestMode, setIsTestMode] = useState(false);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
        
        // Handle Google OAuth sign-in profile creation
        if (event === 'SIGNED_IN' && session?.user) {
          setTimeout(() => {
            handleGoogleProfileCreation(session.user);
          }, 0);
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Deep Link Listener for Google OAuth on Native
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    console.log('🔧 Configurando listener de Deep Link para OAuth...');
    
    let listenerHandle: any;
    
    App.addListener('appUrlOpen', async (event) => {
      console.log('🔗 Deep Link recebido:', event.url);
      
      if (event.url.includes('auth/callback')) {
        console.log('✅ Deep Link de autenticação detectado!');
        
        try {
          // PKCE Flow: Extrair CODE (não tokens!)
          const url = new URL(event.url);
          const params = new URLSearchParams(url.search || url.hash.substring(1));
          
          const code = params.get('code');
          
          console.log('🎫 Código de autorização encontrado:', code ? 'SIM' : 'NÃO');
          
          if (code) {
            console.log('💾 Trocando código por sessão (PKCE)...');
            
            // PKCE: Trocar code por tokens de sessão
            const { data, error } = await supabase.auth.exchangeCodeForSession(code);
            
            if (error) {
              console.error('❌ Erro ao trocar código por sessão:', error);
            } else {
              console.log('✅ Sessão criada com sucesso via PKCE!');
              console.log('👤 Usuário:', data.session?.user?.email);
            }
            
            // Fechar o browser
            console.log('🚪 Fechando browser...');
            await Browser.close();
          } else {
            console.warn('⚠️ Código de autorização não encontrado no URL');
            console.log('📋 URL completo:', event.url);
          }
        } catch (error) {
          console.error('❌ Erro ao processar Deep Link:', error);
        }
      }
    }).then(handle => {
      listenerHandle = handle;
    });

    return () => {
      console.log('🧹 Removendo listener de Deep Link');
      if (listenerHandle) {
        listenerHandle.remove();
      }
    };
  }, []);

  const handleGoogleProfileCreation = async (user: User) => {
    try {
      // Check if profile already exists
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!existingProfile) {
        // Create profile for Google OAuth user
        const { error } = await supabase
          .from('profiles')
          .insert({
            user_id: user.id,
            nome: user.user_metadata?.full_name || user.user_metadata?.name || '',
            provider: 'google',
            provider_id: user.user_metadata?.provider_id || user.id,
            avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture || ''
          });

        if (error) {
          console.error('Erro ao criar perfil para usuário Google:', error);
        }
      }
    } catch (error) {
      console.error('Erro no processamento do perfil Google:', error);
    }
  };

  const signInAnonymously = async () => {
    // Simula login anônimo para modo de teste
    setIsTestMode(true);
    const mockUser = {
      id: 'ae5b5501-7f8a-46da-9cba-b9955a84e697', // USER ID que tem os dados na base
      aud: 'authenticated',
      role: 'authenticated',
      email: 'teste@picotinho.app',
      email_confirmed_at: new Date().toISOString(),
      phone: '',
      confirmed_at: new Date().toISOString(),
      last_sign_in_at: new Date().toISOString(),
      app_metadata: { provider: 'test', providers: ['test'] },
      user_metadata: { name: 'Usuário de Teste' },
      identities: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    } as User;
    setUser(mockUser);
    setLoading(false);
  };

  const signOut = async () => {
    try {
      // Se estiver em modo teste, apenas limpar estado local
      if (isTestMode) {
        setUser(null);
        setSession(null);
        setIsTestMode(false);
        return;
      }

      // Tentar fazer logout no Supabase
      const { error } = await supabase.auth.signOut({ scope: 'global' });
      
      // Mesmo com erro, limpar estado local para evitar problemas de UI
      setUser(null);
      setSession(null);
      setIsTestMode(false);
      
      // Só propagar o erro se for algo crítico (não session not found)
      if (error && !error.message.includes('session_not_found') && !error.message.includes('Session not found')) {
        throw error;
      }
    } catch (error) {
      // Em caso de erro, garantir que o estado local seja limpo
      setUser(null);
      setSession(null);
      setIsTestMode(false);
      
      // Log do erro para debug, mas não propagar erros de sessão
      console.warn('Erro durante logout (não crítico):', error);
    }
  };

  const value = {
    user,
    session,
    loading,
    signInAnonymously,
    signOut,
    isTestMode,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};