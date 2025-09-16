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

  // Carregar perfil atual do usuário
  useEffect(() => {
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
      const { data, error } = await supabase.functions.invoke('geocodificar-endereco', {
        body: {
          cep: cep.replace(/\D/g, ''), // Remove caracteres não numéricos
          endereco: `${profile.bairro}, ${profile.cidade}`,
          cidade: profile.cidade,
          estado: 'BR' // Pode ser expandido para incluir estado no futuro
        }
      });

      if (error) throw error;

      if (data?.latitude && data?.longitude) {
        setProfile(prev => ({
          ...prev,
          latitude: data.latitude,
          longitude: data.longitude
        }));
        
        toast({
          title: "Localização encontrada",
          description: "Coordenadas atualizadas com base no CEP.",
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
    // Formatar CEP automaticamente
    const formatted = value.replace(/\D/g, '').replace(/(\d{5})(\d{3})/, '$1-$2');
    setProfile(prev => ({ ...prev, cep: formatted }));
    
    // Buscar coordenadas quando CEP estiver completo
    if (formatted.length === 9) {
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
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Se não temos coordenadas, buscar antes de salvar
      let latitude = profile.latitude;
      let longitude = profile.longitude;
      
      if (!latitude || !longitude) {
        try {
          const { data } = await supabase.functions.invoke('geocodificar-endereco', {
            body: {
              cep: profile.cep.replace(/\D/g, ''),
              endereco: `${profile.bairro}, ${profile.cidade}`,
              cidade: profile.cidade,
              estado: 'BR'
            }
          });
          
          if (data?.latitude && data?.longitude) {
            latitude = data.latitude;
            longitude = data.longitude;
          }
        } catch (error) {
          console.error('Erro ao buscar coordenadas:', error);
        }
      }

      // Verificar se perfil já existe
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user.id)
        .single();

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

      if (existingProfile) {
        // Atualizar perfil existente
        const { error } = await supabase
          .from('profiles')
          .update(profileData)
          .eq('user_id', user.id);

        if (error) throw error;
      } else {
        // Criar novo perfil
        const { error } = await supabase
          .from('profiles')
          .insert(profileData);

        if (error) throw error;
      }

      toast({
        title: "Perfil salvo",
        description: latitude && longitude 
          ? "Seus dados e localização foram atualizados com sucesso!"
          : "Perfil salvo, mas não foi possível obter a localização via CEP.",
      });

      // Voltar para configurações
      navigate('/configuracoes');
      
    } catch (error) {
      console.error('Erro ao salvar perfil:', error);
      toast({
        variant: "destructive",
        title: "Erro ao salvar",
        description: "Não foi possível salvar seus dados.",
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