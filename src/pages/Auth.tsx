import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, ArrowLeft } from 'lucide-react';

const AuthPage = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    telefone: ''
  });
  const { toast } = useToast();
  const navigate = useNavigate();

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validateTelefone = (telefone: string) => {
    // Remove todos os caracteres não numéricos
    const cleanPhone = telefone.replace(/\D/g, '');
    // Verifica se tem 10 ou 11 dígitos (celular brasileiro)
    return cleanPhone.length >= 10 && cleanPhone.length <= 11;
  };

  const formatTelefone = (value: string) => {
    // Remove caracteres não numéricos
    const cleanValue = value.replace(/\D/g, '');
    
    // Aplica máscara (11) 99999-9999
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
    if (!validateEmail(formData.email)) {
      toast({
        title: "Erro de validação",
        description: "Por favor, insira um e-mail válido",
        variant: "destructive",
      });
      return;
    }

    if (!validateTelefone(formData.telefone)) {
      toast({
        title: "Erro de validação",
        description: "Por favor, insira um telefone válido (10 ou 11 dígitos)",
        variant: "destructive",
      });
      return;
    }

    if (formData.password.length < 6) {
      toast({
        title: "Erro de validação",
        description: "A senha deve ter pelo menos 6 caracteres",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      // Cadastro no Supabase Auth
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          emailRedirectTo: `${window.location.origin}/`
        }
      });

      if (signUpError) {
        if (signUpError.message.includes('already registered')) {
          toast({
            title: "Erro no cadastro",
            description: "Este e-mail já está cadastrado. Tente fazer login.",
            variant: "destructive",
          });
        } else {
          toast({
            title: "Erro no cadastro",
            description: signUpError.message,
            variant: "destructive",
          });
        }
        return;
      }

      if (data.user) {
        // Criar perfil com telefone
        const cleanPhone = formData.telefone.replace(/\D/g, '');
        const { error: profileError } = await supabase
          .from('profiles')
          .insert({
            user_id: data.user.id,
            telefone: cleanPhone
          });

        if (profileError) {
          if (profileError.message.includes('duplicate key')) {
            toast({
              title: "Erro no cadastro",
              description: "Este telefone já está cadastrado. Use outro número.",
              variant: "destructive",
            });
            
            // Deletar usuário criado se o perfil falhar
            await supabase.auth.admin.deleteUser(data.user.id);
            return;
          } else {
            toast({
              title: "Erro no cadastro",
              description: "Erro ao salvar informações do perfil",
              variant: "destructive",
            });
            return;
          }
        }

        toast({
          title: "Cadastro realizado!",
          description: "Sua conta foi criada com sucesso.",
        });

        // Redirecionar para página principal
        navigate('/');
      }
    } catch (error) {
      console.error('Erro no cadastro:', error);
      toast({
        title: "Erro no cadastro",
        description: "Ocorreu um erro inesperado. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignIn = async () => {
    if (!validateEmail(formData.email)) {
      toast({
        title: "Erro de validação",
        description: "Por favor, insira um e-mail válido",
        variant: "destructive",
      });
      return;
    }

    if (!formData.password) {
      toast({
        title: "Erro de validação",
        description: "Por favor, insira sua senha",
        variant: "destructive",
      });
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
          toast({
            title: "Erro no login",
            description: "E-mail ou senha incorretos",
            variant: "destructive",
          });
        } else {
          toast({
            title: "Erro no login",
            description: error.message,
            variant: "destructive",
          });
        }
        return;
      }

      toast({
        title: "Login realizado!",
        description: "Bem-vindo de volta!",
      });

      // Redirecionar para página principal
      navigate('/');
    } catch (error) {
      console.error('Erro no login:', error);
      toast({
        title: "Erro no login",
        description: "Ocorreu um erro inesperado. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
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
            <CardTitle>Notinha</CardTitle>
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
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
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
              </TabsContent>

              <TabsContent value="signup" className="space-y-4">
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
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    A senha deve ter pelo menos 6 caracteres
                  </p>
                </div>

                <Button
                  onClick={handleSignUp}
                  disabled={isLoading}
                  className="w-full"
                >
                  {isLoading ? "Cadastrando..." : "Cadastrar"}
                </Button>

                <p className="text-xs text-muted-foreground text-center">
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