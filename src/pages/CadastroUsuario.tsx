import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { 
  User, 
  ArrowLeft, 
  Save,
  MapPin,
  CheckCircle
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import PicotinhoLogo from "@/components/PicotinhoLogo";

interface UserProfile {
  nome_completo: string;
  email: string;
  telefone: string;
  bairro: string;
  cidade: string;
  cep: string;
  latitude?: number;
  longitude?: number;
}

const CadastroUsuario = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);
  const [profile, setProfile] = useState<UserProfile>({
    nome_completo: '',
    email: '',
    telefone: '',
    bairro: '',
    cidade: '',
    cep: ''
  });

  // Detectar se é mobile e carregar perfil
  useEffect(() => {
    // Detectar dispositivo móvel
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const screenWidth = window.screen.width;
    const viewport = window.innerWidth;
    
    console.log('📱 Detecção de dispositivo:', {
      userAgent: navigator.userAgent,
      isMobile,
      screenWidth,
      viewport,
      platform: navigator.platform,
      maxTouchPoints: navigator.maxTouchPoints
    });
    
    carregarPerfil();
  }, []);

  const carregarPerfil = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (profileData) {
        setProfile({
          nome_completo: profileData.nome_completo || '',
          email: profileData.email || user.email || '',
          telefone: profileData.telefone || '',
          bairro: profileData.bairro || '',
          cidade: profileData.cidade || '',
          cep: profileData.cep || '',
          latitude: profileData.latitude,
          longitude: profileData.longitude
        });
      } else {
        // Se não existe perfil, usar email do auth
        setProfile(prev => ({
          ...prev,
          email: user.email || ''
        }));
      }
    } catch (error) {
      console.error('Erro ao carregar perfil:', error);
      toast({
        variant: "destructive",
        title: "Erro ao carregar",
        description: "Não foi possível carregar seus dados.",
      });
    }
  };

  const buscarCoordenadas = async (cep: string) => {
    if (!cep || cep.length < 8) return;
    
    setCepLoading(true);
    try {
      console.log('🌐 Chamando geocodificação para CEP:', cep);
      
      // Timeout específico para mobile (conexões mais lentas)
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      const timeoutMs = isMobile ? 15000 : 10000; // 15s para mobile, 10s para desktop
      
      const geocodingPromise = supabase.functions.invoke('geocodificar-endereco', {
        body: {
          cep: cep.replace(/\D/g, '') // Usar apenas o CEP para geocodificação precisa
        }
      });
      
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout na geocodificação')), timeoutMs)
      );
      
      const { data, error } = await Promise.race([geocodingPromise, timeoutPromise]) as any;

      console.log('🔍 Resposta buscarCoordenadas:', { data, error });

      if (error) {
        console.error('❌ Erro na função de geocodificação:', error);
        toast({
          variant: "destructive",
          title: "Erro na localização",
          description: "Não foi possível obter coordenadas do CEP.",
        });
      } else if (data?.success && data?.coordenadas) {
        console.log('✅ Coordenadas obtidas via CEP:', data.coordenadas);
        setProfile(prev => ({
          ...prev,
          latitude: data.coordenadas.latitude,
          longitude: data.coordenadas.longitude
        }));
        
        toast({
          title: "Localização encontrada",
          description: `Coordenadas atualizadas: ${data.coordenadas.latitude.toFixed(6)}, ${data.coordenadas.longitude.toFixed(6)}`,
        });
      } else {
        console.log('❌ Não foi possível obter coordenadas:', data);
        toast({
          variant: "destructive",
          title: "Erro na localização", 
          description: "Não foi possível obter coordenadas do CEP.",
        });
      }
    } catch (error) {
      console.error('Erro ao buscar coordenadas:', error);
      toast({
        variant: "destructive",
        title: "Erro na localização",
        description: "Não foi possível obter coordenadas do CEP.",
      });
    } finally {
      setCepLoading(false);
    }
  };

  const handleInputChange = (field: keyof UserProfile, value: string) => {
    setProfile(prev => ({ ...prev, [field]: value }));
  };

  const handleCepChange = (value: string) => {
    console.log('📍 CEP input change:', { value, length: value.length });
    
    // Formatar CEP automaticamente
    const formatted = value.replace(/\D/g, '').replace(/(\d{5})(\d{3})/, '$1-$2');
    console.log('📍 CEP formatado:', { formatted, length: formatted.length });
    
    setProfile(prev => ({ ...prev, cep: formatted }));
    
    // Buscar coordenadas quando CEP estiver completo
    if (formatted.length === 9) {
      console.log('📍 CEP completo, buscando coordenadas...');
      buscarCoordenadas(formatted);
    }
  };

  const salvarPerfil = async () => {
    if (!profile.cep) {
      toast({
        variant: "destructive",
        title: "CEP obrigatório",
        description: "O CEP é obrigatório para definir sua área de atuação.",
      });
      return;
    }

    setLoading(true);
    
    // Log específico para mobile
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    console.log('📱 Iniciando salvamento mobile:', {
      isMobile,
      connectionType: (navigator as any).connection?.effectiveType,
      onLine: navigator.onLine,
      profile: profile
    });
    
    try {
      console.log('🔐 Verificando autenticação...');
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError) {
        console.error('❌ Erro de autenticação:', authError);
        throw new Error(`Erro de autenticação: ${authError.message}`);
      }
      
      if (!user) {
        console.error('❌ Usuário não encontrado');
        throw new Error('Usuário não autenticado. Faça login novamente.');
      }
      
      console.log('✅ Usuário autenticado:', user.id);

      // SEMPRE buscar coordenadas atualizadas baseadas no CEP
      console.log('🔍 Buscando coordenadas para CEP:', profile.cep);
      let latitude = profile.latitude;
      let longitude = profile.longitude;
      
      try {
        const { data, error } = await supabase.functions.invoke('geocodificar-endereco', {
          body: {
            cep: profile.cep.replace(/\D/g, ''),
            endereco: profile.bairro || '',
            cidade: profile.cidade || '',
            estado: 'RJ'
          }
        });
        
        console.log('🔍 Resposta da geocodificação no salvamento:', { data, error });
        
        if (error) {
          console.error('❌ Erro na função de geocodificação:', error);
        } else if (data?.success && data?.coordenadas) {
          latitude = data.coordenadas.latitude;
          longitude = data.coordenadas.longitude;
          console.log('✅ Coordenadas atualizadas para salvamento:', { latitude, longitude });
        } else {
          console.log('❌ Não foi possível obter coordenadas do CEP, usando existentes:', data);
        }
      } catch (error) {
        console.error('❌ Erro ao buscar coordenadas:', error);
      }

      // Preparar dados do perfil
      const profileData = {
        user_id: user.id,
        nome_completo: profile.nome_completo,
        email: profile.email,
        telefone: profile.telefone,
        bairro: profile.bairro,
        cidade: profile.cidade,
        cep: profile.cep,
        latitude: latitude,
        longitude: longitude,
        updated_at: new Date().toISOString()
      };

      console.log('💾 Tentando salvar perfil:', profileData);

      // Verificar se perfil já existe
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user.id)
        .single();

      console.log('👤 Perfil existente encontrado:', existingProfile);

      if (existingProfile) {
        // Atualizar perfil existente
        console.log('🔄 Atualizando perfil existente...');
        const { error } = await supabase
          .from('profiles')
          .update(profileData)
          .eq('user_id', user.id);

        if (error) {
          console.error('❌ Erro ao atualizar perfil:', error);
          throw error;
        }
        console.log('✅ Perfil atualizado com sucesso');
      } else {
        // Criar novo perfil
        console.log('➕ Criando novo perfil...');
        const { error } = await supabase
          .from('profiles')
          .insert(profileData);

        if (error) {
          console.error('❌ Erro ao criar perfil:', error);
          throw error;
        }
        console.log('✅ Novo perfil criado com sucesso');
      }

      toast({
        title: "Perfil salvo",
        description: latitude && longitude 
          ? "Seus dados e localização foram atualizados com sucesso!"
          : "Perfil salvo, mas não foi possível obter a localização via CEP.",
      });

      // Voltar para configurações
      navigate('/configuracoes');
      
    } catch (error: any) {
      console.error('❌ Erro ao salvar perfil:', error);
      console.error('❌ Detalhes do erro:', {
        message: error?.message,
        code: error?.code,
        details: error?.details,
        hint: error?.hint,
        userProfile: profile
      });
      
      toast({
        variant: "destructive",
        title: "Erro ao salvar",
        description: error?.message || "Não foi possível salvar seus dados. Verifique se todos os dados estão corretos.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-subtle flex flex-col pb-32">
      {/* Header com logo e botão de voltar */}
      <div className="flex justify-between items-center p-4">
        <Button 
          variant="ghost" 
          onClick={() => navigate('/configuracoes')}
          className="flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar
        </Button>
        <PicotinhoLogo />
        <div className="w-16" /> {/* Spacer para centralizar o logo */}
      </div>

      {/* Main content area */}
      <div className="flex-1 px-6 pb-8">
        <div className="max-w-md mx-auto">
          {/* Título da página */}
          <div className="text-center mb-6">
            <div className="flex items-center justify-center gap-2 mb-2">
              <User className="w-6 h-6 text-primary" />
              <h1 className="text-2xl font-bold text-foreground">
                Cadastro do Usuário
              </h1>
            </div>
            <p className="text-muted-foreground">
              Complete suas informações pessoais
            </p>
          </div>

          {/* Formulário */}
          <Card>
            <CardHeader>
              <CardTitle>Dados Pessoais</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              
              {/* Nome Completo */}
              <div className="space-y-2">
                <Label htmlFor="nome">Nome Completo</Label>
                <Input
                  id="nome"
                  value={profile.nome_completo}
                  onChange={(e) => handleInputChange('nome_completo', e.target.value)}
                  placeholder="Seu nome completo"
                />
              </div>

              {/* E-mail */}
              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  value={profile.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  placeholder="seu@email.com"
                />
              </div>

              {/* Telefone */}
              <div className="space-y-2">
                <Label htmlFor="telefone">Telefone</Label>
                <Input
                  id="telefone"
                  value={profile.telefone}
                  onChange={(e) => handleInputChange('telefone', e.target.value)}
                  placeholder="(11) 99999-9999"
                />
                <p className="text-xs text-muted-foreground">
                  Não precisa validar - já validamos via WhatsApp
                </p>
              </div>

              {/* CEP */}
              <div className="space-y-2">
                <Label htmlFor="cep">CEP *</Label>
                <div className="relative">
                  <Input
                    id="cep"
                    value={profile.cep}
                    onChange={(e) => handleCepChange(e.target.value)}
                    placeholder="00000-000"
                    maxLength={9}
                    className={cepLoading ? "pr-10" : ""}
                  />
                  {cepLoading && (
                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Campo obrigatório - usado para calcular sua área de atuação
                </p>
              </div>

              {/* Bairro */}
              <div className="space-y-2">
                <Label htmlFor="bairro">Bairro</Label>
                <Input
                  id="bairro"
                  value={profile.bairro}
                  onChange={(e) => handleInputChange('bairro', e.target.value)}
                  placeholder="Seu bairro"
                />
              </div>

              {/* Cidade */}
              <div className="space-y-2">
                <Label htmlFor="cidade">Cidade</Label>
                <Input
                  id="cidade"
                  value={profile.cidade}
                  onChange={(e) => handleInputChange('cidade', e.target.value)}
                  placeholder="Sua cidade"
                />
              </div>

              {/* Status da Localização */}
              {profile.latitude && profile.longitude && (
                <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  <span className="text-sm text-green-700 dark:text-green-400">
                    Localização encontrada via CEP
                  </span>
                  <MapPin className="w-4 h-4 text-green-600" />
                </div>
              )}

            </CardContent>
          </Card>

          {/* Botão Salvar */}
          <div className="mt-6">
            <Button 
              onClick={salvarPerfil}
              disabled={loading || !profile.cep}
              className="w-full"
              size="lg"
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Salvando...
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Save className="w-4 h-4" />
                  Salvar Cadastro
                </div>
              )}
            </Button>
          </div>

          {/* Informação adicional */}
          <div className="mt-4 p-4 text-center text-muted-foreground bg-muted/30 rounded-lg">
            <p className="text-sm">
              Seus dados serão usados para personalizar sua experiência e calcular a área de atuação baseada no seu CEP.
            </p>
          </div>

        </div>
      </div>
    </div>
  );
};

export default CadastroUsuario;