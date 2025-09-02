import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Smartphone, CheckCircle, Send } from "lucide-react";
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
  verificado: boolean;
  codigo_verificacao?: string;
  data_codigo?: string;
}

export default function WhatsAppConfig() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [dddNumero, setDddNumero] = useState("");
  const [loading, setLoading] = useState(false);
  const [verificado, setVerificado] = useState(false);
  const [codigoEnviado, setCodigoEnviado] = useState(false);
  const [codigoVerificacao, setCodigoVerificacao] = useState("");
  const [verificandoCodigo, setVerificandoCodigo] = useState(false);

  // Carregar configuração existente
  useEffect(() => {
    if (user) {
      loadConfig();
    }
  }, [user]);

  const loadConfig = async () => {
    try {
      const { data, error } = await supabase
        .from('whatsapp_configuracoes')
        .select('numero_whatsapp, verificado')
        .eq('usuario_id', user?.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        // Extrair apenas DDD + número (remover +55)
        const numeroCompleto = data.numero_whatsapp || "";
        const dddNumeroSemPrefixo = numeroCompleto.replace(/^\+55/, "");
        setDddNumero(dddNumeroSemPrefixo);
        setVerificado(data.verificado || false);
      }
    } catch (error) {
      console.error('Erro ao carregar configuração:', error);
    }
  };

  const enviarCodigo = async () => {
    if (!user || !dddNumero.trim()) {
      toast.error("Por favor, informe seu DDD + número");
      return;
    }

    // Validar se tem pelo menos 10 dígitos (DDD + 8/9 dígitos)
    const numeroLimpo = dddNumero.replace(/\D/g, '');
    if (numeroLimpo.length < 10 || numeroLimpo.length > 11) {
      toast.error("Número inválido. Digite apenas DDD + número (ex: 21970016024)");
      return;
    }
    
    setLoading(true);
    try {
      const numeroCompleto = `+55${numeroLimpo}`;
      
      const { data, error } = await supabase.functions.invoke('send-whatsapp-verification', {
        body: {
          numeroCompleto,
          usuarioId: user.id
        }
      });

      if (error) throw error;

      if (data.success) {
        toast.success("Código enviado! Verifique seu WhatsApp");
        setCodigoEnviado(true);
      } else {
        throw new Error(data.error || 'Erro ao enviar código');
      }
    } catch (error: any) {
      console.error('Erro ao enviar código:', error);
      toast.error("Erro ao enviar código: " + error.message);
    }
    setLoading(false);
  };

  const verificarCodigo = async () => {
    if (!codigoVerificacao.trim() || codigoVerificacao.length !== 6) {
      toast.error("Digite o código de 6 dígitos");
      return;
    }
    
    setVerificandoCodigo(true);
    try {
      const { data, error } = await supabase.functions.invoke('verify-whatsapp-code', {
        body: {
          codigo: codigoVerificacao,
          usuarioId: user?.id
        }
      });

      if (error) throw error;

      if (data.success) {
        toast.success("Número verificado com sucesso! 🎉");
        setVerificado(true);
        setCodigoEnviado(false);
        setCodigoVerificacao("");
        loadConfig(); // Recarregar configuração
      } else {
        toast.error(data.error || 'Código incorreto');
      }
    } catch (error: any) {
      console.error('Erro ao verificar código:', error);
      toast.error("Erro ao verificar código: " + error.message);
    }
    setVerificandoCodigo(false);
  };

  const formatarDddNumero = (numero: string) => {
    // Remove tudo que não é número
    const cleaned = numero.replace(/\D/g, '');
    
    // Limita a 11 dígitos (DDD + 9 dígitos)
    const limitado = cleaned.slice(0, 11);
    
    // Formatação para DDD + número
    if (limitado.length <= 2) {
      return limitado;
    } else if (limitado.length <= 7) {
      // (XX) XXXXX
      return limitado.replace(/(\d{2})(\d)/, '$1 $2');
    } else {
      // (XX) XXXXX-XXXX
      return limitado.replace(/(\d{2})(\d{4,5})(\d{4})/, '$1 $2-$3');
    }
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
          {verificado ? (
            // Usuário já verificado - mostrar status
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-green-600">
                  <CheckCircle className="h-5 w-5" />
                  WhatsApp Verificado
                </CardTitle>
                <CardDescription>
                  Seu número +55 {formatarDddNumero(dddNumero)} está ativo e pronto para usar
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="bg-green-50 p-4 rounded-lg mb-4">
                  <h4 className="font-medium text-green-900 mb-2">
                    ✅ Como usar o Picotinho:
                  </h4>
                  <div className="text-sm text-green-800 space-y-1">
                    <p><strong>Baixar estoque:</strong> "Picotinho, baixa 1 quilo de banana"</p>
                    <p><strong>Consultar:</strong> "Picotinho, qual o preço do açúcar?"</p>
                    <p><strong>Adicionar:</strong> "Picotinho, adiciona leite na lista"</p>
                  </div>
                </div>
                
                <div className="pt-4 border-t">
                  <p className="text-sm text-gray-600 mb-2">
                    Quer alterar seu número ou reverificar?
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setVerificado(false);
                      setDddNumero("");
                    }}
                    className="w-full"
                  >
                    Configurar Novo Número
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : codigoEnviado ? (
            // Código enviado - aguardando verificação
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Smartphone className="h-5 w-5" />
                  Verificar Código
                </CardTitle>
                <CardDescription>
                  Enviamos um código para +55 {formatarDddNumero(dddNumero)}. Digite o código de 6 dígitos:
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Input
                    placeholder="123456"
                    value={codigoVerificacao}
                    onChange={(e) => {
                      const valor = e.target.value.replace(/\D/g, '');
                      if (valor.length <= 6) {
                        setCodigoVerificacao(valor);
                      }
                    }}
                    maxLength={6}
                    className="text-center text-2xl tracking-widest"
                  />
                </div>

                <div className="flex gap-2">
                  <Button 
                    onClick={verificarCodigo}
                    disabled={verificandoCodigo || codigoVerificacao.length !== 6}
                    className="flex-1"
                  >
                    {verificandoCodigo ? "Verificando..." : "Verificar Código"}
                  </Button>
                  <Button 
                    variant="outline"
                    onClick={() => setCodigoEnviado(false)}
                    disabled={loading}
                  >
                    Voltar
                  </Button>
                </div>

                <div className="text-center">
                  <Button 
                    variant="link"
                    onClick={enviarCodigo}
                    disabled={loading}
                    className="text-sm"
                  >
                    Reenviar código
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            // Configuração inicial do número
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Smartphone className="h-5 w-5" />
                  Seu Número
                </CardTitle>
                <CardDescription>
                  Digite seu DDD + número do WhatsApp (sem o +55)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Número do WhatsApp
                  </label>
                  <div className="flex">
                    <div className="flex items-center px-3 bg-gray-100 border border-r-0 rounded-l-md text-gray-600">
                      +55
                    </div>
                    <Input
                      placeholder="21 97001-6024"
                      value={formatarDddNumero(dddNumero)}
                      onChange={(e) => {
                        const valor = e.target.value.replace(/\D/g, '');
                        setDddNumero(valor);
                      }}
                      className="rounded-l-none"
                      maxLength={13}
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Digite apenas DDD + número (ex: 21970016024)
                  </p>
                </div>

                <Button 
                  onClick={enviarCodigo}
                  disabled={loading || !dddNumero.trim()}
                  className="w-full flex items-center gap-2"
                >
                  <Send className="h-4 w-4" />
                  {loading ? "Enviando..." : "Enviar Código"}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}