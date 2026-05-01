import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { App } from '@capacitor/app';
import { InAppBrowser } from '@capgo/inappbrowser';
import { Capacitor } from '@capacitor/core';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
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

  useEffect(() => {
    console.log('🚨🚨🚨 AUTHPROVIDER: INAPPBROWSER VERSÃO ATIVA 🚨🚨🚨');
    console.log('📱 Biblioteca: @capgo/inappbrowser v7.29.0');
    console.log('⏰ Timestamp:', new Date().toISOString());
    console.log('❌ NÃO USANDO MAIS @capacitor/browser');
    
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
            enforceInviteForOAuth(session.user);
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
            await InAppBrowser.close();
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

  const signOut = async () => {
    try {
      // Tentar fazer logout no Supabase
      const { error } = await supabase.auth.signOut({ scope: 'global' });
      
      // Mesmo com erro, limpar estado local para evitar problemas de UI
      setUser(null);
      setSession(null);
      
      // Só propagar o erro se for algo crítico (não session not found)
      if (error && !error.message.includes('session_not_found') && !error.message.includes('Session not found')) {
        throw error;
      }
    } catch (error) {
      // Em caso de erro, garantir que o estado local seja limpo
      setUser(null);
      setSession(null);
      
      // Log do erro para debug, mas não propagar erros de sessão
      console.warn('Erro durante logout (não crítico):', error);
    }
  };

  const value = {
    user,
    session,
    loading,
    signOut,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};