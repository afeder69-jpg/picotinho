import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import PicotinhoLogo from '@/components/PicotinhoLogo';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, ArrowLeft, Loader2 } from 'lucide-react';

const RECOVERY_TIMEOUT_MS = 15000; // 15s máximo de espera pela sessão

const mapAuthError = (message: string): { title: string; description: string; variant: string } => {
  const lower = message.toLowerCase();

  if (lower.includes('new password should be different')) {
    return {
      title: 'Senha igual à anterior',
      description: 'A nova senha precisa ser diferente da anterior. Tente outra senha.',
      variant: 'default',
    };
  }
  if (lower.includes('password') && lower.includes('least')) {
    return {
      title: 'Senha muito curta',
      description: 'A senha precisa ter pelo menos 6 caracteres.',
      variant: 'default',
    };
  }
  if (lower.includes('session') || lower.includes('not authenticated')) {
    return {
      title: 'Sessão expirada',
      description: 'Sua sessão expirou. Solicite um novo link de redefinição na tela de login.',
      variant: 'destructive',
    };
  }
  return {
    title: 'Não foi possível alterar a senha',
    description: 'Ocorreu um erro inesperado. Tente novamente ou solicite um novo link.',
    variant: 'destructive',
  };
};

const ResetPassword = () => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isRecovery, setIsRecovery] = useState(false);
  const [isProcessing, setIsProcessing] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const { toast } = useToast();
  const navigate = useNavigate();
  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const params = new URLSearchParams(window.location.search);
    const hasCode = params.has('code');
    const hasHashRecovery = window.location.hash.includes('type=recovery');
    const hasRecoveryMarker = hasCode || hasHashRecovery;

    console.log('[ResetPassword] Init — hasCode:', hasCode, 'hasHashRecovery:', hasHashRecovery);

    if (!hasRecoveryMarker) {
      console.log('[ResetPassword] Nenhum marcador de recovery encontrado');
      setErrorMessage('Este link de redefinição expirou ou já foi utilizado. Solicite um novo link na tela de login.');
      setIsProcessing(false);
      return;
    }

    // Marca na sessionStorage que estamos em recovery (para o guard do Auth.tsx)
    sessionStorage.setItem('picotinho_recovery_active', 'true');

    let resolved = false;

    const resolve = (success: boolean, error?: string) => {
      if (resolved) return;
      resolved = true;
      if (success) {
        console.log('[ResetPassword] ✅ Recovery validado, liberando formulário');
        setIsRecovery(true);
      } else {
        console.log('[ResetPassword] ❌ Recovery falhou:', error);
        setErrorMessage(error || 'Este link de redefinição expirou ou já foi utilizado. Solicite um novo link na tela de login.');
        sessionStorage.removeItem('picotinho_recovery_active');
      }
      setIsProcessing(false);
    };

    // Timeout de segurança
    const timeout = setTimeout(() => {
      console.log('[ResetPassword] ⏰ Timeout aguardando sessão de recovery');
      resolve(false, 'Tempo esgotado ao processar o link. Solicite um novo link na tela de login.');
    }, RECOVERY_TIMEOUT_MS);

    // Tentar sessão já existente (detectSessionInUrl pode já ter processado)
    const checkExistingSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      console.log('[ResetPassword] getSession:', session ? 'sessão encontrada' : 'sem sessão');
      if (session && !resolved) {
        clearTimeout(timeout);
        resolve(true);
      }
    };

    // Listener para capturar o evento quando detectSessionInUrl processar o code
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[ResetPassword] onAuthStateChange:', event, session ? 'com sessão' : 'sem sessão');
      if ((event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') && session) {
        clearTimeout(timeout);
        resolve(true);
      }
    });

    checkExistingSession();

    return () => {
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  const handleResetPassword = async () => {
    if (password.length < 6) {
      toast({
        title: "Senha muito curta",
        description: "A senha deve ter pelo menos 6 caracteres.",
        variant: "destructive",
      });
      return;
    }

    if (password !== confirmPassword) {
      toast({
        title: "Senhas não conferem",
        description: "A senha e a confirmação devem ser iguais.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        const friendlyMessage = mapAuthError(error.message);
        toast({
          title: friendlyMessage.title,
          description: friendlyMessage.description,
          variant: friendlyMessage.variant as any,
        });
      } else {
        sessionStorage.removeItem('picotinho_recovery_active');
        toast({
          title: "Senha redefinida com sucesso! ✅",
          description: "Você já pode fazer login com sua nova senha.",
        });
        navigate('/auth');
      }
    } catch (error) {
      toast({
        title: "Erro inesperado",
        description: "Tente novamente mais tarde.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Loading enquanto processa o token
  if (isProcessing) {
    return (
      <div className="min-h-screen bg-gradient-subtle flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <PicotinhoLogo size="lg" />
            </div>
            <CardTitle>Processando...</CardTitle>
            <CardDescription>Validando seu link de redefinição de senha</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </CardContent>
        </Card>
      </div>
    );
  }

  // Erro: link inválido/expirado
  if (!isRecovery) {
    return (
      <div className="min-h-screen bg-gradient-subtle flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <PicotinhoLogo size="lg" />
            </div>
            <CardTitle>Link expirado</CardTitle>
            <CardDescription>
              {errorMessage || 'Este link de redefinição de senha é inválido ou expirou. Solicite um novo link na tela de login.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate('/auth')} className="w-full">
              Voltar para o login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-subtle flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-6">
          <Button variant="ghost" onClick={() => navigate('/auth')} className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar
          </Button>
        </div>

        <Card>
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <PicotinhoLogo size="lg" />
            </div>
            <CardTitle>Redefinir senha</CardTitle>
            <CardDescription>Digite sua nova senha abaixo</CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-password">Nova senha</Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Mínimo 6 caracteres"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
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

            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirmar nova senha</Label>
              <Input
                id="confirm-password"
                type={showPassword ? "text" : "password"}
                placeholder="Repita a nova senha"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={isLoading}
              />
            </div>

            <Button onClick={handleResetPassword} disabled={isLoading} className="w-full">
              {isLoading ? "Salvando..." : "Salvar nova senha"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ResetPassword;
