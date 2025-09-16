import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { formatarDistancia } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { 
  MapPin, 
  Store, 
  ArrowLeft, 
  Navigation,
  CheckCircle,
  AlertCircle,
  Package
} from "lucide-react";
import { useNavigate } from "react-router-dom";

interface Supermercado {
  id: string;
  nome: string;
  cnpj: string;
  endereco: string;
  cidade: string;
  estado: string;
  latitude: number;
  longitude: number;
  distancia: number;
  produtos_disponiveis: number;
}

interface ConfiguracaoUsuario {
  raio_busca_km: number;
}

const AreaAtuacao = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [raioAtual, setRaioAtual] = useState<number>(5);
  const [localizacaoUsuario, setLocalizacaoUsuario] = useState<{ latitude: number; longitude: number } | null>(null);
  const [supermercados, setSupermercados] = useState<Supermercado[]>([]);
  const [carregandoLocalizacao, setCarregandoLocalizacao] = useState(false);
  const [carregandoSupermercados, setCarregandoSupermercados] = useState(false);
  const [configuracaoCarregada, setConfiguracaoCarregada] = useState(false);
  const [temCepCadastrado, setTemCepCadastrado] = useState<boolean | null>(null);

  // Carregar configuração atual do usuário
  useEffect(() => {
    carregarConfiguracaoUsuario();
  }, []);

  // Recarregar localização quando a página ganhar foco (detecta mudanças do CEP)
  useEffect(() => {
    const handleFocus = () => {
      if (configuracaoCarregada) {
        console.log('Página ganhou foco - recarregando localização...');
        obterLocalizacao();
      }
    };

    const handleVisibilityChange = () => {
      if (!document.hidden && configuracaoCarregada) {
        console.log('Página se tornou visível - recarregando localização...');
        obterLocalizacao();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [configuracaoCarregada]);

  // Polling periódico para detectar mudanças no CEP (a cada 5 segundos quando ativo)
  useEffect(() => {
    if (!configuracaoCarregada) return;

    const interval = setInterval(() => {
      // Verificar se há mudanças no perfil apenas se a página estiver visível
      if (!document.hidden) {
        console.log('Verificando atualizações automáticas do perfil...');
        obterLocalizacao();
      }
    }, 5000); // Verifica a cada 5 segundos

    return () => clearInterval(interval);
  }, [configuracaoCarregada]);

  // Buscar supermercados quando raio ou localização mudarem
  useEffect(() => {
    if (localizacaoUsuario && configuracaoCarregada && temCepCadastrado) {
      buscarSupermercados();
    }
  }, [raioAtual, localizacaoUsuario, configuracaoCarregada, temCepCadastrado]);

  const carregarConfiguracaoUsuario = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: configuracao } = await supabase
        .from('configuracoes_usuario')
        .select('raio_busca_km')
        .eq('usuario_id', user.id)
        .single();

      if (configuracao) {
        setRaioAtual(configuracao.raio_busca_km || 5);
      }
      
      setConfiguracaoCarregada(true);
      
      // Obter localização automaticamente
      obterLocalizacao();
    } catch (error) {
      console.error('Erro ao carregar configuração:', error);
      setConfiguracaoCarregada(true);
      obterLocalizacao();
    }
  };

  const obterLocalizacao = async () => {
    console.log('📍 Iniciando obtenção de localização...');
    setCarregandoLocalizacao(true);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Primeiro tentar buscar localização do perfil do usuário (via CEP)
      const { data: profile } = await supabase
        .from('profiles')
        .select('latitude, longitude, cep, cidade')
        .eq('user_id', user.id)
        .single();

      // Verificar se tem CEP cadastrado
      const cepExiste = profile?.cep && profile?.cep.trim().length > 0;
      console.log(`📋 CEP encontrado no perfil: ${profile?.cep || 'NENHUM'}`);
      console.log(`🗺️ Coordenadas atuais: ${profile?.latitude}, ${profile?.longitude}`);
      console.log(`🏙️ Cidade: ${profile?.cidade || 'NÃO INFORMADA'}`);
      
      setTemCepCadastrado(cepExiste);

      if (!cepExiste) {
        // Se não tem CEP, não mostrar supermercados
        console.log('❌ Nenhum CEP cadastrado - área de atuação desabilitada');
        setCarregandoLocalizacao(false);
        return;
      }

      if (profile?.latitude && profile?.longitude) {
        // Usar localização do CEP cadastrado
        console.log(`✅ Usando coordenadas do CEP: ${profile.latitude}, ${profile.longitude}`);
        setLocalizacaoUsuario({
          latitude: profile.latitude,
          longitude: profile.longitude
        });
        setCarregandoLocalizacao(false);
        
        toast({
          title: "Localização obtida via CEP",
          description: `Usando localização cadastrada: ${profile.cidade || 'Seu endereço'}`,
        });
        return;
      }
    } catch (error) {
      console.error('Erro ao buscar perfil:', error);
      setTemCepCadastrado(false);
    }
    
    // Fallback para GPS se não tiver CEP cadastrado
    if (!navigator.geolocation) {
      toast({
        variant: "destructive",
        title: "Configure seu CEP",
        description: "Vá em Configurações > Cadastro do Usuário para definir sua localização via CEP.",
      });
      setCarregandoLocalizacao(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocalizacaoUsuario({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        });
        setCarregandoLocalizacao(false);
        
        toast({
          title: "Localização GPS obtida",
          description: "Recomendamos cadastrar seu CEP em Configurações para maior precisão.",
        });
      },
      (error) => {
        console.error('Erro ao obter localização:', error);
        setCarregandoLocalizacao(false);
        
        // Usar localização padrão (São Paulo) como fallback
        setLocalizacaoUsuario({
          latitude: -23.5505,
          longitude: -46.6333
        });
        
        toast({
          variant: "destructive",
          title: "Configure seu CEP",
          description: "Vá em Configurações > Cadastro do Usuário para definir sua localização.",
        });
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000 // 5 minutos
      }
    );
  };

  const buscarSupermercados = async () => {
    if (!localizacaoUsuario) return;
    
    setCarregandoSupermercados(true);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase.functions.invoke('buscar-supermercados-area', {
        body: {
          latitude: localizacaoUsuario.latitude,
          longitude: localizacaoUsuario.longitude,
          raio: raioAtual,
          userId: user.id
        }
      });

      if (error) throw error;

      console.log('🔍 DEBUG - Supermercados recebidos da API:', {
        total: data.supermercados?.length || 0,
        raioConsultado: data.raioConsultado,
        coordenadas: data.coordenadas,
        supermercados: data.supermercados?.map(s => ({
          nome: s.nome,
          distancia: s.distancia,
          produtos: s.produtos_disponiveis
        }))
      });

      setSupermercados(data.supermercados || []);
      
    } catch (error) {
      console.error('Erro ao buscar supermercados:', error);
      toast({
        variant: "destructive",
        title: "Erro ao buscar supermercados",
        description: "Não foi possível carregar os supermercados da área.",
      });
    } finally {
      setCarregandoSupermercados(false);
    }
  };

  const salvarConfiguracaoAutomaticamente = async (novoRaio: number) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Primeiro tentar atualizar a configuração existente
      const { data: configuracaoExistente } = await supabase
        .from('configuracoes_usuario')
        .select('id')
        .eq('usuario_id', user.id)
        .single();

      if (configuracaoExistente) {
        // Atualizar configuração existente
        const { error } = await supabase
          .from('configuracoes_usuario')
          .update({
            raio_busca_km: novoRaio,
            updated_at: new Date().toISOString()
          })
          .eq('usuario_id', user.id);

        if (error) throw error;
      } else {
        // Criar nova configuração
        const { error } = await supabase
          .from('configuracoes_usuario')
          .insert({
            usuario_id: user.id,
            raio_busca_km: novoRaio
          });

        if (error) throw error;
      }

      toast({
        title: "Configuração atualizada",
        description: `Área de atuação definida para ${novoRaio}km de raio.`,
      });
    } catch (error) {
      console.error('Erro ao salvar configuração:', error);
      toast({
        variant: "destructive",
        title: "Erro ao salvar",
        description: "Não foi possível salvar a configuração.",
      });
    }
  };

  const handleRaioChange = (values: number[]) => {
    const novoRaio = values[0];
    setRaioAtual(novoRaio);
  };

  const handleRaioChangeComplete = (values: number[]) => {
    const novoRaio = values[0];
    salvarConfiguracaoAutomaticamente(novoRaio);
  };


  return (
    <div className="min-h-screen bg-gradient-subtle p-4 pb-32">
      <div className="max-w-2xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button 
            variant="outline" 
            size="icon"
            onClick={() => navigate('/menu')}
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Área de Atuação</h1>
            <p className="text-sm text-muted-foreground">Configure o raio geográfico dos seus supermercados</p>
          </div>
        </div>

        {/* Configuração de Raio */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-primary" />
              Configurar Raio de Busca
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            
            {/* Status da Localização */}
            <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
              {carregandoLocalizacao ? (
                <>
                  <Navigation className="w-4 h-4 animate-spin text-primary" />
                  <span className="text-sm">Obtendo sua localização...</span>
                </>
              ) : temCepCadastrado === false ? (
                <>
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                  <span className="text-sm">CEP necessário para localização</span>
                  <Button size="sm" variant="outline" onClick={() => navigate('/configuracoes-usuario/cadastro-usuario')}>
                    Cadastrar CEP
                  </Button>
                </>
              ) : localizacaoUsuario ? (
                <>
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  <span className="text-sm">Localização detectada via CEP</span>
                  <Badge variant="outline" className="text-xs">
                    {localizacaoUsuario.latitude.toFixed(4)}, {localizacaoUsuario.longitude.toFixed(4)}
                  </Badge>
                </>
              ) : (
                <>
                  <AlertCircle className="w-4 h-4 text-yellow-600" />
                  <span className="text-sm">Localização não disponível</span>
                  <Button size="sm" variant="outline" onClick={obterLocalizacao}>
                    Tentar novamente
                  </Button>
                </>
              )}
            </div>

            {/* Slider de Raio */}
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <label className="text-sm font-medium">Raio de Atuação</label>
                <Badge variant="secondary" className="text-lg font-bold">
                  {raioAtual} km
                </Badge>
              </div>
              
              <Slider
                value={[raioAtual]}
                onValueChange={handleRaioChange}
                onValueCommit={handleRaioChangeComplete}
                max={50}
                min={1}
                step={1}
                className="w-full"
              />
              
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>1 km</span>
                <span>25 km</span>
                <span>50 km</span>
              </div>
            </div>

          </CardContent>
        </Card>

        {/* Lista de Supermercados */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Store className="w-5 h-5 text-primary" />
              Supermercados na Área
              {!carregandoSupermercados && temCepCadastrado && (
                <Badge variant="outline">
                  {supermercados.length} encontrados
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {temCepCadastrado === false ? (
              // Mensagem para usuários sem CEP cadastrado
              <div className="text-center py-12">
                <MapPin className="w-16 h-16 mx-auto text-muted-foreground mb-6" />
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  CEP necessário para continuar
                </h3>
                <p className="text-muted-foreground mb-6">
                  Para visualizar sua área de atuação, cadastre primeiro o seu CEP em Configurações do Usuário.
                </p>
                <Button 
                  onClick={() => navigate('/configuracoes-usuario/cadastro-usuario')}
                  className="gap-2"
                >
                  <MapPin className="w-4 h-4" />
                  Cadastrar CEP
                </Button>
              </div>
            ) : carregandoSupermercados ? (
              <div className="flex items-center justify-center p-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                <span className="ml-2">Buscando supermercados...</span>
              </div>
            ) : supermercados.length === 0 ? (
              <div className="text-center py-8">
                <Store className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  Nenhum supermercado encontrado nesta área.
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  Tente aumentar o raio de busca.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {supermercados.map((supermercado, index) => (
                  <div key={supermercado.id} className="p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <h3 className="font-medium text-foreground">{supermercado.nome}</h3>
                        <p className="text-sm text-muted-foreground">
                          {supermercado.endereco}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {supermercado.cidade}, {supermercado.estado}
                        </p>
                      </div>
                      <div className="text-right space-y-1">
                        <Badge variant="outline">
                          {formatarDistancia(supermercado.distancia)}
                        </Badge>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Package className="w-3 h-3" />
                          {supermercado.produtos_disponiveis} produtos
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Informações Adicionais */}
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground space-y-2">
              <p className="flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                Os supermercados são listados por ordem de proximidade
              </p>
              <p className="flex items-center gap-2">
                <Store className="w-4 h-4" />
                Apenas supermercados com produtos cadastrados são exibidos
              </p>
              <p className="flex items-center gap-2">
                <Package className="w-4 h-4" />
                O número de produtos indica itens com preços atualizados
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AreaAtuacao;