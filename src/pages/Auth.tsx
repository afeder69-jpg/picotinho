import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import PicotinhoLogo from '@/components/PicotinhoLogo';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, ArrowLeft } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { InAppBrowser } from '@capgo/inappbrowser';
import { useAppConfig } from '@/hooks/useAppConfig';

const COOLDOWN_SECONDS = 60;

const useCooldown = () => {
  const [secondsLeft, setSecondsLeft] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startCooldown = useCallback(() => {
    setSecondsLeft(COOLDOWN_SECONDS);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  return { secondsLeft, isOnCooldown: secondsLeft > 0, startCooldown };
};

const AuthPage = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [isOAuthLoading, setIsOAuthLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    telefone: '',
    codigoConvite: ''
  });
  const { toast } = useToast();
  const navigate = useNavigate();
  const isNative = Capacitor.isNativePlatform();
  const { acessoRestrito } = useAppConfig();

  const resetCooldown = useCooldown();
  const signupCooldown = useCooldown();

  // Redirect quando sessão já existe (única fonte: AuthProvider via supabase listener)
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log('🔄 [Auth.tsx] state changed:', event, !!session);
        if (event === 'SIGNED_IN' && session?.user) {
          const isRecoveryFlow = window.location.pathname === '/reset-password'
            || sessionStorage.getItem('picotinho_recovery_active') === 'true';
          if (isRecoveryFlow) {
            console.log('⏳ Recovery flow ativo, não redirecionar');
            return;
          }
          navigate('/', { replace: true });
        }
      }
    );

    // Check inicial (não bloqueante)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        const isRecoveryFlow = window.location.pathname === '/reset-password'
          || sessionStorage.getItem('picotinho_recovery_active') === 'true';
        if (!isRecoveryFlow) navigate('/', { replace: true });
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validateTelefone = (telefone: string) => {
    const cleanPhone = telefone.replace(/\D/g, '');
    return cleanPhone.length >= 10 && cleanPhone.length <= 11;
  };

  const formatTelefone = (value: string) => {
    const cleanValue = value.replace(/\D/g, '');
    if (cleanValue.length <= 11) {
      return cleanValue
        .replace(/^(\d{2})(\d)/g, '($1) $2')
        .replace(/(\d)(\d{4})$/, '$1-$2');
    }
    return value;
  };

  const handleInputChange = (field: string, value: string) => {
    if (field === 'telefone') {
      value = formatTelefone(value);
    }
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSignUp = async () => {
    if (signupCooldown.isOnCooldown) return;

    if (!validateEmail(formData.email)) {
      toast({ title: "Erro de validação", description: "Por favor, insira um e-mail válido", variant: "destructive" });
      return;
    }

    if (!validateTelefone(formData.telefone)) {
      toast({ title: "Erro de validação", description: "Por favor, insira um telefone válido (10 ou 11 dígitos)", variant: "destructive" });
      return;
    }

    if (formData.password.length < 6) {
      toast({ title: "Erro de validação", description: "A senha deve ter pelo menos 6 caracteres", variant: "destructive" });
      return;
    }

    // Validação de código de convite (somente em modo restrito)
    const codigoNorm = formData.codigoConvite.toUpperCase().trim();
    if (acessoRestrito) {
      if (!/^[A-Z0-9]{8}$/.test(codigoNorm)) {
        toast({
          title: "Código de convite obrigatório",
          description: "Informe um código de 8 caracteres (letras e números).",
          variant: "destructive",
        });
        return;
      }
    }

    setIsLoading(true);

    try {
      // 1) Em modo restrito: reservar convite ANTES do signUp
      let tokenTemp: string | null = null;
      if (acessoRestrito) {
        const { data: consumirData, error: consumirErr } = await supabase.functions.invoke(
          'consumir-convite',
          { body: { codigo: codigoNorm, email: formData.email.toLowerCase().trim() } }
        );

        if (consumirErr || !consumirData?.ok) {
          console.warn('[signup] consumir-convite falhou:', { consumirErr, consumirData });
          const motivo = consumirData?.motivo;
          const mensagens: Record<string, string> = {
            formato_invalido: "Código inválido. Use 8 caracteres (letras e números).",
            email_invalido: "Informe um e-mail válido.",
            inexistente: "Código de convite não encontrado.",
            usado: "Este código já foi utilizado.",
            cancelado: "Este código de convite foi cancelado.",
            expirado: "Este código de convite expirou.",
            reservado: "Este código está em uso. Tente novamente em alguns minutos.",
            email_nao_corresponde: "Este código foi gerado para outro e-mail.",
            rate_limit: "Muitas tentativas. Aguarde um instante e tente novamente.",
          };
          const descricao =
            mensagens[motivo as string] ||
            consumirData?.mensagem ||
            consumirErr?.message ||
            "Não foi possível validar o convite. Tente novamente.";
          toast({
            title: "Não foi possível usar o convite",
            description: descricao,
            variant: "destructive",
          });
          return;
        }
        tokenTemp = consumirData.token_temp;
      }

      // Helper: libera reserva caso o signUp falhe depois
      const liberarReserva = async () => {
        if (!tokenTemp) return;
        try {
          await supabase.functions.invoke('liberar-convite', { body: { token_temp: tokenTemp } });
        } catch (e) {
          console.warn('[signup] liberar-convite falhou (best-effort):', e);
        }
      };

      // 2) signUp normal
      const cleanPhone = formData.telefone.replace(/\D/g, '');
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
          data: { telefone: cleanPhone }
        }
      });

      if (signUpError) {
        console.warn('[signup] supabase.auth.signUp falhou:', signUpError);
        await liberarReserva();
        const msg = signUpError.message || '';
        if (msg.includes('already registered')) {
          toast({ title: "E-mail já cadastrado", description: "Este e-mail já possui uma conta. Por favor, faça login ou use outro e-mail.", variant: "default" });
        } else if (msg.includes('rate limit')) {
          toast({ title: "Muitas tentativas", description: "Por favor, aguarde alguns segundos antes de tentar novamente.", variant: "default" });
        } else if (msg.toLowerCase().includes('database error') || msg.toLowerCase().includes('saving new user')) {
          toast({
            title: "Não foi possível concluir o cadastro",
            description: "Verifique se o telefone informado já não está cadastrado em outra conta.",
            variant: "destructive",
          });
        } else {
          toast({ title: "Erro no cadastro", description: msg || "Tente novamente em alguns segundos.", variant: "destructive" });
        }
        return;
      }

      if (data.user) {
        // Supabase retorna user com identities vazio quando e-mail já existe
        if (!data.user.identities || data.user.identities.length === 0) {
          await liberarReserva();
          toast({
            title: "E-mail já cadastrado",
            description: "Este e-mail já está cadastrado. Caso não lembre sua senha, utilize 'Esqueci minha senha'.",
            variant: "default",
          });
          return;
        }

        // 3) Confirmar convite (best-effort — só após confirmar e-mail e logar é que o JWT estará ativo).
        // Como Supabase exige confirmação por e-mail, o token_temp (10min) será usado pelo
        // próprio confirmar-convite no primeiro login. Disparamos aqui caso já haja sessão (auto-confirm habilitado).
        if (tokenTemp && data.session) {
          try {
            await supabase.functions.invoke('confirmar-convite', { body: { token_temp: tokenTemp } });
          } catch (e) {
            console.warn('confirmar-convite falhou (best-effort):', e);
          }
        }
        // Guarda o token para confirmação posterior, no primeiro login
        if (tokenTemp) {
          try { localStorage.setItem('picotinho_convite_token', tokenTemp); } catch {}
        }

        signupCooldown.startCooldown();
        toast({
          title: "Cadastro realizado com sucesso! ✅",
          description: "Enviamos um e-mail de confirmação para sua caixa de entrada. Acesse seu e-mail e clique no link para ativar sua conta.",
          variant: "default",
        });
        setFormData({ email: '', password: '', telefone: '', codigoConvite: '' });
      }
    } catch (error) {
      console.error('Erro no cadastro:', error);
      toast({ title: "Erro no cadastro", description: "Ocorreu um erro inesperado. Tente novamente.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      setIsOAuthLoading(true);
      console.log('🚀 Iniciando login com Google...');

      if (isNative) {
        const redirectTo = 'picotinho://auth/callback';
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo, skipBrowserRedirect: true }
        });
        if (error) throw error;
        await InAppBrowser.open({ url: data.url });
      } else {
        const redirectUrl = `${window.location.origin}/`;
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo: redirectUrl }
        });
        if (error) throw error;
      }
    } catch (error: any) {
      console.error('❌ Erro no login com Google:', error);
      toast({ title: "Erro no login com Google", description: error.message || "Tente novamente.", variant: "destructive" });
      setIsOAuthLoading(false);
    }
  };

  const handleFacebookSignIn = async () => {
    try {
      setIsOAuthLoading(true);
      console.log('🚀 Iniciando login com Facebook...');

      if (isNative) {
        const redirectTo = 'picotinho://auth/callback';
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: 'facebook',
          options: { redirectTo, skipBrowserRedirect: true }
        });
        if (error) throw error;
        await InAppBrowser.open({ url: data.url });
      } else {
        const redirectUrl = `${window.location.origin}/`;
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'facebook',
          options: { redirectTo: redirectUrl }
        });
        if (error) throw error;
      }
    } catch (error: any) {
      console.error('❌ Erro no login com Facebook:', error);
      toast({ title: "Erro no login com Facebook", description: error.message || "Tente novamente.", variant: "destructive" });
      setIsOAuthLoading(false);
    }
  };

  const handleSignIn = async () => {
    if (!validateEmail(formData.email)) {
      toast({ title: "Erro de validação", description: "Por favor, insira um e-mail válido", variant: "destructive" });
      return;
    }

    if (!formData.password) {
      toast({ title: "Erro de validação", description: "Por favor, insira sua senha", variant: "destructive" });
      return;
    }

    setIsLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: formData.email,
        password: formData.password,
      });

      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          toast({ title: "Erro no login", description: "E-mail ou senha incorretos", variant: "destructive" });
        } else if (error.message.includes('Email not confirmed')) {
          toast({ title: "E-mail não confirmado", description: "Verifique seu e-mail e clique no link de confirmação antes de fazer login", variant: "destructive" });
        } else {
          toast({ title: "Erro no login", description: error.message, variant: "destructive" });
        }
        return;
      }

      toast({ title: "Login realizado!", description: "Bem-vindo de volta!" });

      // Best-effort: confirma convite pendente após primeiro login
      try {
        const tokenPendente = localStorage.getItem('picotinho_convite_token');
        if (tokenPendente) {
          await supabase.functions.invoke('confirmar-convite', { body: { token_temp: tokenPendente } });
          localStorage.removeItem('picotinho_convite_token');
        }
      } catch (e) {
        console.warn('confirmar-convite pós-login falhou:', e);
      }

      navigate('/');
    } catch (error) {
      console.error('Erro no login:', error);
      toast({ title: "Erro no login", description: "Ocorreu um erro inesperado. Tente novamente.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (resetCooldown.isOnCooldown) return;

    if (!formData.email || !validateEmail(formData.email)) {
      toast({
        title: "Informe seu e-mail",
        description: "Preencha o campo de e-mail para receber o link de redefinição de senha.",
        variant: "destructive",
      });
      return;
    }
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(formData.email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      resetCooldown.startCooldown();
      toast({
        title: "E-mail enviado! ✉️",
        description: "Verifique sua caixa de entrada para redefinir sua senha.",
      });
    } catch (err: any) {
      toast({
        title: "Erro",
        description: err.message || "Não foi possível enviar o e-mail. Tente novamente.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-subtle flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={() => navigate('/')}
            className="mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar
          </Button>
        </div>

        <Card>
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <PicotinhoLogo size="lg" />
            </div>
            <CardDescription>
              Gerencie suas compras de supermercado
            </CardDescription>
          </CardHeader>

          <CardContent>
            <Tabs defaultValue="login" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">Login</TabsTrigger>
                <TabsTrigger value="signup">Cadastrar</TabsTrigger>
              </TabsList>

              <TabsContent value="login" className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email">E-mail</Label>
                  <Input
                    id="login-email"
                    type="email"
                    placeholder="seu@email.com"
                    value={formData.email}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                    disabled={isLoading}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="login-password">Senha</Label>
                  <div className="relative">
                    <Input
                      id="login-password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Sua senha"
                      value={formData.password}
                      onChange={(e) => handleInputChange('password', e.target.value)}
                      disabled={isLoading}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                <Button
                  onClick={handleSignIn}
                  disabled={isLoading}
                  className="w-full"
                >
                  {isLoading ? "Entrando..." : "Entrar"}
                </Button>

                <Button
                  type="button"
                  variant="link"
                  className="w-full text-sm text-muted-foreground"
                  onClick={handleForgotPassword}
                  disabled={isLoading || resetCooldown.isOnCooldown}
                >
                  {resetCooldown.isOnCooldown
                    ? `Aguarde ${resetCooldown.secondsLeft}s para reenviar`
                    : "Esqueci minha senha"}
                </Button>

                <div className="relative my-4">
                  <Separator />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="bg-background px-2 text-xs text-muted-foreground">ou</span>
                  </div>
                </div>

                <Button
                  onClick={handleGoogleSignIn}
                  disabled={isOAuthLoading}
                  variant="outline"
                  className="w-full"
                >
                  <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24">
                    <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  {isOAuthLoading ? "Abrindo..." : "Entrar com Google"}
                </Button>

                <Button
                  onClick={handleFacebookSignIn}
                  disabled={isOAuthLoading}
                  variant="outline"
                  className="w-full"
                >
                  <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24">
                    <path fill="#1877F2" d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                  </svg>
                  {isOAuthLoading ? "Abrindo..." : "Entrar com Facebook"}
                </Button>
              </TabsContent>

              <TabsContent value="signup" className="space-y-4">
                {acessoRestrito && (
                  <>
                    <div className="p-3 rounded-md border border-primary/30 bg-primary/5 text-sm text-foreground">
                      🔒 <strong>Cadastros são por convite.</strong> Insira o código que você recebeu para criar sua conta.
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signup-codigo">Código de convite *</Label>
                      <Input
                        id="signup-codigo"
                        type="text"
                        placeholder="XXXXXXXX"
                        value={formData.codigoConvite}
                        onChange={(e) => {
                          const filtered = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
                          setFormData(prev => ({ ...prev, codigoConvite: filtered }));
                        }}
                        disabled={isLoading}
                        maxLength={8}
                        className="font-mono tracking-widest text-center"
                      />
                      <p className="text-xs text-muted-foreground">
                        8 caracteres (letras maiúsculas e números)
                      </p>
                    </div>
                  </>
                )}
                <div className="space-y-2">
                  <Label htmlFor="signup-email">E-mail *</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    placeholder="seu@email.com"
                    value={formData.email}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                    disabled={isLoading}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signup-phone">Telefone *</Label>
                  <Input
                    id="signup-phone"
                    type="tel"
                    placeholder="(11) 99999-9999"
                    value={formData.telefone}
                    onChange={(e) => handleInputChange('telefone', e.target.value)}
                    disabled={isLoading}
                    maxLength={15}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signup-password">Senha *</Label>
                  <div className="relative">
                    <Input
                      id="signup-password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Mínimo 6 caracteres"
                      value={formData.password}
                      onChange={(e) => handleInputChange('password', e.target.value)}
                      disabled={isLoading}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    A senha deve ter pelo menos 6 caracteres
                  </p>
                </div>

                <Button
                  onClick={handleSignUp}
                  disabled={isLoading || signupCooldown.isOnCooldown}
                  className="w-full"
                >
                  {signupCooldown.isOnCooldown
                    ? `E-mail enviado! Aguarde ${signupCooldown.secondsLeft}s`
                    : isLoading ? "Cadastrando..." : "Cadastrar"}
                </Button>

                <p className="text-xs text-muted-foreground text-center mb-4">
                  Você receberá um e-mail para confirmar seu cadastro
                </p>

                <div className="relative my-4">
                  <Separator />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="bg-background px-2 text-xs text-muted-foreground">ou</span>
                  </div>
                </div>

                <Button
                  onClick={handleGoogleSignIn}
                  disabled={isLoading}
                  variant="outline"
                  className="w-full"
                >
                  <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24">
                    <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Entrar com Google
                </Button>

                <Button
                  onClick={handleFacebookSignIn}
                  disabled={isLoading}
                  variant="outline"
                  className="w-full"
                >
                  <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24">
                    <path fill="#1877F2" d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                  </svg>
                  Entrar com Facebook
                </Button>

                <p className="text-xs text-muted-foreground text-center mt-4">
                  * Campos obrigatórios
                </p>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AuthPage;
