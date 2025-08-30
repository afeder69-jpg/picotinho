import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { ArrowLeft, Smartphone, MessageSquare, Minus, Shield, CheckCircle } from "lucide-react";
import PicotinhoLogo from "@/components/PicotinhoLogo";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { toast } from "sonner";

// Estados da verificação
type EstadoVerificacao = 'inicial' | 'aguardando_codigo' | 'verificado';

export default function WhatsAppConfig() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [numeroWhatsApp, setNumeroWhatsApp] = useState("");
  const [codigoVerificacao, setCodigoVerificacao] = useState("");
  const [estadoVerificacao, setEstadoVerificacao] = useState<EstadoVerificacao>('inicial');
  const [loading, setLoading] = useState(false);
  const [loadingVerificacao, setLoadingVerificacao] = useState(false);

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
        setNumeroWhatsApp(data.numero_whatsapp || "");
        if (data.verificado) {
          setEstadoVerificacao('verificado');
        }
      }
    } catch (error) {
      console.error('Erro ao carregar configuração:', error);
    }
  };

  const enviarCodigoVerificacao = async () => {
    if (!user || !numeroWhatsApp.trim()) {
      toast.error("Por favor, informe seu número do WhatsApp");
      return;
    }
    
    setLoading(true);
    try {
      // Salvar número no banco (ainda não verificado)
      const dadosConfig = {
        usuario_id: user.id,
        numero_whatsapp: numeroWhatsApp.trim(),
        verificado: false,
        ...SYSTEM_CONFIG
      };

      const { error } = await supabase
        .from('whatsapp_configuracoes')
        .upsert(dadosConfig, { onConflict: 'usuario_id' });

      if (error) throw error;

      // Enviar código de verificação
      const { error: errorCodigo } = await supabase.functions.invoke('send-verification-code', {
        body: {
          numeroWhatsApp: numeroWhatsApp.trim(),
          nomeUsuario: user.user_metadata?.nome || user.email?.split('@')[0]
        }
      });

      if (errorCodigo) {
        console.error('Erro ao enviar código:', errorCodigo);
        toast.error("Erro ao enviar código de verificação");
        return;
      }

      toast.success("Código de verificação enviado via WhatsApp! 📱");
      setEstadoVerificacao('aguardando_codigo');
      
    } catch (error) {
      console.error('Erro ao enviar código:', error);
      toast.error("Erro ao enviar código de verificação");
    }
    setLoading(false);
  };

  const verificarCodigo = async () => {
    if (!codigoVerificacao || codigoVerificacao.length !== 6) {
      toast.error("Digite o código de 6 dígitos");
      return;
    }

    setLoadingVerificacao(true);
    try {
      const { data, error } = await supabase.functions.invoke('verify-whatsapp-code', {
        body: {
          numeroWhatsApp: numeroWhatsApp.trim(),
          codigo: codigoVerificacao,
          nomeUsuario: user?.user_metadata?.nome || user?.email?.split('@')[0]
        }
      });

      if (error) {
        console.error('Erro na verificação:', error);
        if (error.message?.includes('Código incorreto')) {
          toast.error("Código incorreto. Tente novamente.");
        } else if (error.message?.includes('expirado')) {
          toast.error("Código expirado. Solicite um novo código.");
          setEstadoVerificacao('inicial');
        } else {
          toast.error("Erro ao verificar código");
        }
        return;
      }

      if (data?.success) {
        toast.success("🎉 Integração WhatsApp ativada com sucesso!");
        setEstadoVerificacao('verificado');
        setCodigoVerificacao("");
      } else {
        toast.error("Erro na verificação do código");
      }
      
    } catch (error) {
      console.error('Erro ao verificar código:', error);
      toast.error("Erro ao verificar código");
    }
    setLoadingVerificacao(false);
  };

  const formatarNumero = (numero: string) => {
    // Remove tudo que não é número
    const cleaned = numero.replace(/\D/g, '');
    
    // Aplica formatação (XX) XXXXX-XXXX
    if (cleaned.length <= 11) {
      return cleaned
        .replace(/(\d{2})(\d)/, '($1) $2')
        .replace(/(\d{5})(\d)/, '$1-$2');
    }
    return cleaned.slice(0, 11)
      .replace(/(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{5})(\d)/, '$1-$2');
  };

  const resetarVerificacao = () => {
    setEstadoVerificacao('inicial');
    setCodigoVerificacao("");
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
          {/* Status da Integração */}
          {estadoVerificacao === 'verificado' && (
            <Card className="border-green-200 bg-green-50">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3 text-green-800">
                  <CheckCircle className="h-6 w-6" />
                  <div>
                    <h3 className="font-semibold">WhatsApp Integrado</h3>
                    <p className="text-sm">Número {formatarNumero(numeroWhatsApp)} verificado e ativo</p>
                  </div>
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={resetarVerificacao}
                  className="mt-3"
                >
                  Alterar número
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Configuração do Número */}
          {estadoVerificacao !== 'verificado' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Smartphone className="h-5 w-5" />
                  {estadoVerificacao === 'inicial' ? 'Seu Número' : 'Verificação'}
                </CardTitle>
                <CardDescription>
                  {estadoVerificacao === 'inicial' 
                    ? 'Digite seu número do WhatsApp para receber comandos do Picotinho'
                    : 'Digite o código de 6 dígitos enviado para seu WhatsApp'
                  }
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {estadoVerificacao === 'inicial' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        Número do WhatsApp
                      </label>
                      <Input
                        placeholder="(11) 99999-9999"
                        value={formatarNumero(numeroWhatsApp)}
                        onChange={(e) => {
                          // Remove formatação antes de salvar
                          const numero = e.target.value.replace(/\D/g, '');
                          setNumeroWhatsApp(numero);
                        }}
                        maxLength={15}
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Apenas números (DDD + número). Ex: 11999999999
                      </p>
                    </div>

                    <Button 
                      onClick={enviarCodigoVerificacao} 
                      disabled={loading || !numeroWhatsApp.trim()}
                      className="w-full"
                    >
                      {loading ? "Enviando código..." : "Enviar código de verificação"}
                    </Button>
                  </>
                )}

                {estadoVerificacao === 'aguardando_codigo' && (
                  <>
                    <div className="text-center space-y-4">
                      <div className="flex items-center justify-center gap-2 text-blue-600">
                        <Shield className="h-5 w-5" />
                        <span className="font-medium">Código enviado para {formatarNumero(numeroWhatsApp)}</span>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium mb-3">
                          Digite o código de 6 dígitos
                        </label>
                        <div className="flex justify-center">
                          <InputOTP
                            maxLength={6}
                            value={codigoVerificacao}
                            onChange={setCodigoVerificacao}
                          >
                            <InputOTPGroup>
                              <InputOTPSlot index={0} />
                              <InputOTPSlot index={1} />
                              <InputOTPSlot index={2} />
                              <InputOTPSlot index={3} />
                              <InputOTPSlot index={4} />
                              <InputOTPSlot index={5} />
                            </InputOTPGroup>
                          </InputOTP>
                        </div>
                        <p className="text-xs text-gray-500 mt-2">
                          ⏱️ O código expira em 10 minutos
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Button 
                          onClick={verificarCodigo} 
                          disabled={loadingVerificacao || codigoVerificacao.length !== 6}
                          className="w-full"
                        >
                          {loadingVerificacao ? "Verificando..." : "Verificar código"}
                        </Button>
                        
                        <Button 
                          variant="outline" 
                          onClick={resetarVerificacao}
                          className="w-full"
                        >
                          Voltar e alterar número
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* Comandos Disponíveis */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                Comandos disponíveis no WhatsApp
              </CardTitle>
              <CardDescription>
                Lista de comandos que você pode enviar para o Picotinho
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <h4 className="font-medium text-blue-900 mb-3 flex items-center gap-2">
                    <Minus className="h-4 w-4" />
                    Baixa de Estoque
                  </h4>
                  <div className="space-y-2 text-sm text-blue-800">
                    <div className="bg-white/50 p-2 rounded">
                      <span className="font-mono bg-blue-100 px-2 py-1 rounded text-xs">
                        👉 "Picotinho, baixa do estoque 1kg de banana prata"
                      </span>
                    </div>
                    <div className="bg-white/50 p-2 rounded">
                      <span className="font-mono bg-blue-100 px-2 py-1 rounded text-xs">
                        👉 "Picotinho, dar baixa em 2 unidades de leite integral"
                      </span>
                    </div>
                  </div>
                </div>
                
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-sm text-gray-600">
                    💡 <strong>Dica:</strong> Sempre comece a mensagem com "Picotinho" para que o sistema reconheça o comando.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}