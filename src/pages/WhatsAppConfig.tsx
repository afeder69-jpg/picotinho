import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, MessageCircle, CheckCircle, AlertCircle, Smartphone } from "lucide-react";
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
  const [numeroWhatsApp, setNumeroWhatsApp] = useState("");
  const [mensagens, setMensagens] = useState<WhatsAppMessage[]>([]);
  const [loading, setLoading] = useState(false);

  // Configuração global do sistema (administrador)
  const SYSTEM_CONFIG = {
    api_provider: "z-api",
    webhook_token: "",
    ativo: true
  };

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
        .select('numero_whatsapp')
        .eq('usuario_id', user?.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setNumeroWhatsApp(data.numero_whatsapp || "");
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
    if (!user || !numeroWhatsApp.trim()) {
      toast.error("Por favor, informe seu número do WhatsApp");
      return;
    }
    
    setLoading(true);
    try {
      const dadosConfig = {
        usuario_id: user.id,
        numero_whatsapp: numeroWhatsApp.trim(),
        ...SYSTEM_CONFIG // Usa configuração global do sistema
      };

      const { error } = await supabase
        .from('whatsapp_configuracoes')
        .upsert(dadosConfig, { onConflict: 'usuario_id' });

      if (error) throw error;

      toast.success("Número do WhatsApp salvo com sucesso!");
      loadConfig();
    } catch (error) {
      console.error('Erro ao salvar configuração:', error);
      toast.error("Erro ao salvar configuração");
    }
    setLoading(false);
  };

  const formatarData = (data: string) => {
    return new Date(data).toLocaleString('pt-BR');
  };

  const formatarNumero = (numero: string) => {
    // Remove tudo que não é número
    const cleaned = numero.replace(/\D/g, '');
    
    // Formatação para números com código do país (13 dígitos) ou sem (11 dígitos)
    if (cleaned.length <= 11) {
      // Formato nacional: (XX) XXXXX-XXXX
      return cleaned
        .replace(/(\d{2})(\d)/, '($1) $2')
        .replace(/(\d{5})(\d)/, '$1-$2');
    } else if (cleaned.length <= 13) {
      // Formato internacional: +XX (XX) XXXXX-XXXX
      return cleaned
        .replace(/(\d{2})(\d{2})(\d)/, '+$1 ($2) $3')
        .replace(/(\d{5})(\d)/, '$1-$2');
    }
    // Limita a 13 dígitos para formato internacional
    return cleaned.slice(0, 13)
      .replace(/(\d{2})(\d{2})(\d)/, '+$1 ($2) $3')
      .replace(/(\d{5})(\d)/, '$1-$2');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-blue-50 p-4">
      <div className="max-w-2xl mx-auto">
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
            <h1 className="text-2xl font-bold text-gray-900">WhatsApp</h1>
            <p className="text-gray-600">Configure seu número para comandos do Picotinho</p>
          </div>
        </div>

        <div className="space-y-6">
          {/* Configuração do Número */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Smartphone className="h-5 w-5" />
                Seu Número
              </CardTitle>
              <CardDescription>
                Digite seu número do WhatsApp para receber comandos do Picotinho
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Número do WhatsApp
                </label>
                <Input
                  placeholder="+55 (11) 99999-9999 ou (11) 99999-9999"
                  value={formatarNumero(numeroWhatsApp)}
                  onChange={(e) => {
                    // Remove formatação antes de salvar
                    const numero = e.target.value.replace(/\D/g, '');
                    setNumeroWhatsApp(numero);
                  }}
                  maxLength={20}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Aceita formato nacional (11999999999) ou internacional (5511999999999)
                </p>
              </div>

              <Button 
                onClick={salvarConfig} 
                disabled={loading || !numeroWhatsApp.trim()}
                className="w-full"
              >
                {loading ? "Salvando..." : "Salvar Número"}
              </Button>

              {numeroWhatsApp && (
                <div className="bg-green-50 p-3 rounded-lg">
                  <h4 className="font-medium text-green-900 mb-2">
                    ✅ Como usar o Picotinho:
                  </h4>
                  <div className="text-sm text-green-800 space-y-1">
                    <p><strong>Baixar estoque:</strong> "Picotinho, baixa 1 quilo de banana"</p>
                    <p><strong>Consultar:</strong> "Picotinho, qual o preço do açúcar?"</p>
                    <p><strong>Adicionar:</strong> "Picotinho, adiciona leite na lista"</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Mensagens Recebidas */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageCircle className="h-5 w-5" />
                Histórico de Comandos
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={loadMensagens}
                >
                  Atualizar
                </Button>
              </CardTitle>
              <CardDescription>
                Comandos enviados para o Picotinho via WhatsApp
              </CardDescription>
            </CardHeader>
            <CardContent>
              {mensagens.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <MessageCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Nenhum comando recebido ainda</p>
                  <p className="text-sm">Configure seu número e envie um comando de teste</p>
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
                          {mensagem.comando_identificado ? (
                            <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-medium">
                              {mensagem.comando_identificado.replace('_', ' ')}
                            </span>
                          ) : (
                            <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded text-xs">
                              mensagem
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