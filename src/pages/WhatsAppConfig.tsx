import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, MessageCircle, Smartphone, Settings, CheckCircle, AlertCircle } from "lucide-react";
import PicotinhoLogo from "@/components/PicotinhoLogo";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { toast } from "sonner";

interface WhatsAppConfig {
  id?: string;
  numero_whatsapp: string;
  api_provider: string;
  webhook_token?: string;
  ativo: boolean;
}

interface WhatsAppMessage {
  id: string;
  remetente: string;
  conteudo: string;
  tipo_mensagem: string;
  comando_identificado?: string;
  data_recebimento: string;
  processada: boolean;
}

export default function WhatsAppConfig() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [config, setConfig] = useState<WhatsAppConfig>({
    numero_whatsapp: "",
    api_provider: "z-api",
    webhook_token: "",
    ativo: true
  });
  const [mensagens, setMensagens] = useState<WhatsAppMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState("");

  // Gerar URL do webhook
  useEffect(() => {
    const baseUrl = "https://mjsbwrtegorjxcepvrik.supabase.co/functions/v1/whatsapp-webhook";
    setWebhookUrl(baseUrl);
  }, []);

  // Carregar configuração existente
  useEffect(() => {
    if (user) {
      loadConfig();
      loadMensagens();
    }
  }, [user]);

  const loadConfig = async () => {
    try {
      const { data, error } = await supabase
        .from('whatsapp_configuracoes')
        .select('*')
        .eq('usuario_id', user?.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setConfig(data);
      }
    } catch (error) {
      console.error('Erro ao carregar configuração:', error);
    }
  };

  const loadMensagens = async () => {
    try {
      const { data, error } = await supabase
        .from('whatsapp_mensagens')
        .select('*')
        .eq('usuario_id', user?.id)
        .order('data_recebimento', { ascending: false })
        .limit(10);

      if (error) throw error;
      setMensagens(data || []);
    } catch (error) {
      console.error('Erro ao carregar mensagens:', error);
    }
  };

  const salvarConfig = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const dadosConfig = {
        usuario_id: user.id,
        numero_whatsapp: config.numero_whatsapp,
        api_provider: config.api_provider,
        webhook_token: config.webhook_token,
        ativo: config.ativo
      };

      const { error } = await supabase
        .from('whatsapp_configuracoes')
        .upsert(dadosConfig, { onConflict: 'usuario_id' });

      if (error) throw error;

      toast.success("Configuração salva com sucesso!");
      loadConfig();
    } catch (error) {
      console.error('Erro ao salvar configuração:', error);
      toast.error("Erro ao salvar configuração");
    }
    setLoading(false);
  };

  const testarWebhook = async () => {
    try {
      const response = await fetch(webhookUrl, {
        method: 'GET',
      });
      
      if (response.ok) {
        toast.success("Webhook está funcionando!");
      } else {
        toast.error("Erro ao testar webhook");
      }
    } catch (error) {
      toast.error("Erro ao conectar com webhook");
    }
  };

  const formatarData = (data: string) => {
    return new Date(data).toLocaleString('pt-BR');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-blue-50 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => navigate("/menu")}
            className="hover:bg-white/50"
          >
            <ArrowLeft className="h-6 w-6" />
          </Button>
          <PicotinhoLogo />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Configuração WhatsApp</h1>
            <p className="text-gray-600">Configure a integração do Picotinho com WhatsApp</p>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Configuração */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Configurações
              </CardTitle>
              <CardDescription>
                Configure seu número e provedor de API do WhatsApp
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Número do WhatsApp
                </label>
                <Input
                  placeholder="11999999999"
                  value={config.numero_whatsapp}
                  onChange={(e) => setConfig(prev => ({ 
                    ...prev, 
                    numero_whatsapp: e.target.value 
                  }))}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Apenas números, sem símbolos (DDD + número)
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Provedor de API
                </label>
                <select 
                  className="w-full p-2 border rounded-md"
                  value={config.api_provider}
                  onChange={(e) => setConfig(prev => ({ 
                    ...prev, 
                    api_provider: e.target.value 
                  }))}
                >
                  <option value="z-api">Z-API</option>
                  <option value="twilio">Twilio</option>
                  <option value="meta">Meta WhatsApp Cloud API</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Token do Webhook (opcional)
                </label>
                <Input
                  type="password"
                  placeholder="Token de validação"
                  value={config.webhook_token || ""}
                  onChange={(e) => setConfig(prev => ({ 
                    ...prev, 
                    webhook_token: e.target.value 
                  }))}
                />
              </div>

              <Button 
                onClick={salvarConfig} 
                disabled={loading}
                className="w-full"
              >
                {loading ? "Salvando..." : "Salvar Configuração"}
              </Button>
            </CardContent>
          </Card>

          {/* URL do Webhook */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageCircle className="h-5 w-5" />
                URL do Webhook
              </CardTitle>
              <CardDescription>
                Configure esta URL no seu provedor de WhatsApp
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  URL para configurar no {config.api_provider.toUpperCase()}:
                </label>
                <div className="flex gap-2">
                  <Input
                    value={webhookUrl}
                    readOnly
                    className="font-mono text-xs"
                  />
                  <Button
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(webhookUrl);
                      toast.success("URL copiada!");
                    }}
                  >
                    Copiar
                  </Button>
                </div>
              </div>

              <Button 
                onClick={testarWebhook} 
                variant="outline"
                className="w-full"
              >
                <Smartphone className="h-4 w-4 mr-2" />
                Testar Webhook
              </Button>

              <div className="bg-blue-50 p-3 rounded-lg">
                <h4 className="font-medium text-blue-900 mb-2">
                  📋 Instruções de configuração:
                </h4>
                <ol className="text-sm text-blue-800 space-y-1">
                  <li>1. Copie a URL do webhook acima</li>
                  <li>2. Configure no seu provedor de WhatsApp</li>
                  <li>3. Salve suas configurações</li>
                  <li>4. Teste enviando uma mensagem</li>
                </ol>
              </div>
            </CardContent>
          </Card>

          {/* Mensagens Recebidas */}
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageCircle className="h-5 w-5" />
                Mensagens Recebidas
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={loadMensagens}
                >
                  Atualizar
                </Button>
              </CardTitle>
              <CardDescription>
                Últimas mensagens recebidas via WhatsApp
              </CardDescription>
            </CardHeader>
            <CardContent>
              {mensagens.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <MessageCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Nenhuma mensagem recebida ainda</p>
                  <p className="text-sm">Configure o webhook e envie uma mensagem de teste</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {mensagens.map((mensagem) => (
                    <div 
                      key={mensagem.id}
                      className="border rounded-lg p-3 bg-white"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {mensagem.remetente}
                          </span>
                          {mensagem.comando_identificado && (
                            <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs">
                              {mensagem.comando_identificado}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          {mensagem.processada ? (
                            <CheckCircle className="h-4 w-4 text-green-500" />
                          ) : (
                            <AlertCircle className="h-4 w-4 text-yellow-500" />
                          )}
                          {formatarData(mensagem.data_recebimento)}
                        </div>
                      </div>
                      <p className="text-gray-700">{mensagem.conteudo}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}