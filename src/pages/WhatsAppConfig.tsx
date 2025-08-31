import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Smartphone, MessageSquare, Minus, Shield, CheckCircle } from "lucide-react";
import PicotinhoLogo from "@/components/PicotinhoLogo";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { toast } from "sonner";

export default function WhatsAppConfig() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [numeroWhatsApp, setNumeroWhatsApp] = useState("");
  const [codigoVerificacao, setCodigoVerificacao] = useState("");
  const [loading, setLoading] = useState(false);
  const [etapaVerificacao, setEtapaVerificacao] = useState<'numero' | 'codigo'>('numero');
  const [whatsappAtivo, setWhatsappAtivo] = useState(false);

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
        .select('*')
        .eq('usuario_id', user?.id)
        .maybeSingle();

      if (error) {
        console.error('Erro ao carregar configuração:', error);
        setWhatsappAtivo(false);
        setEtapaVerificacao('numero');
        return;
      }

      if (data) {
        setNumeroWhatsApp(data.numero_whatsapp || "");
        // Verificar se tem as colunas verificado e ativo
        const verificado = (data as any).verificado || false;
        const ativo = data.ativo || false;
        setWhatsappAtivo(verificado && ativo);
        if (verificado && ativo) {
          setEtapaVerificacao('numero');
        }
      }
    } catch (error) {
      console.error('Erro ao carregar configuração:', error);
      setWhatsappAtivo(false);
      setEtapaVerificacao('numero');
    }
  };

  const enviarCodigo = async () => {
    if (!user || !numeroWhatsApp.trim()) {
      toast.error("Por favor, informe seu número do WhatsApp");
      return;
    }
    
    setLoading(true);
    try {
      const response = await supabase.functions.invoke('send-verification-code', {
        body: {
          numero_whatsapp: numeroWhatsApp.trim(),
          usuario_id: user.id
        }
      });

      if (response.error) {
        throw response.error;
      }

      toast.success("Código de verificação enviado para seu WhatsApp!");
      setEtapaVerificacao('codigo');
    } catch (error) {
      console.error('Erro ao enviar código:', error);
      toast.error("Erro ao enviar código de verificação");
    }
    setLoading(false);
  };

  const verificarCodigo = async () => {
    if (!user || !codigoVerificacao.trim()) {
      toast.error("Por favor, digite o código de verificação");
      return;
    }
    
    setLoading(true);
    try {
      const response = await supabase.functions.invoke('verify-whatsapp-code', {
        body: {
          codigo: codigoVerificacao.trim(),
          usuario_id: user.id
        }
      });

      if (response.error) {
        throw response.error;
      }

      toast.success("WhatsApp verificado e ativado com sucesso!");
      setWhatsappAtivo(true);
      setEtapaVerificacao('numero');
      setCodigoVerificacao("");
      loadConfig();
    } catch (error) {
      console.error('Erro ao verificar código:', error);
      toast.error(error.message || "Código de verificação incorreto");
    }
    setLoading(false);
  };

  const trocarNumero = () => {
    setWhatsappAtivo(false);
    setEtapaVerificacao('numero');
    setCodigoVerificacao("");
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
          {/* Status do WhatsApp */}
          {whatsappAtivo && (
            <Card className="bg-green-50 border-green-200">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <CheckCircle className="h-6 w-6 text-green-600" />
                  <div>
                    <h3 className="font-semibold text-green-900">WhatsApp Integrado</h3>
                    <p className="text-sm text-green-700">
                      Número: {formatarNumero(numeroWhatsApp)}
                    </p>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={trocarNumero}
                    className="ml-auto border-green-300 text-green-700 hover:bg-green-100"
                  >
                    Trocar Número
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Configuração do Número */}
          {!whatsappAtivo && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  {etapaVerificacao === 'numero' ? 'Configurar WhatsApp' : 'Verificar Código'}
                </CardTitle>
                <CardDescription>
                  {etapaVerificacao === 'numero' 
                    ? 'Digite seu número do WhatsApp para receber o código de verificação'
                    : 'Digite o código de 6 dígitos enviado para seu WhatsApp'
                  }
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {etapaVerificacao === 'numero' ? (
                  <>
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        Número do WhatsApp
                      </label>
                      <Input
                        placeholder="(11) 99999-9999"
                        value={formatarNumero(numeroWhatsApp)}
                        onChange={(e) => {
                          const numero = e.target.value.replace(/\D/g, '');
                          setNumeroWhatsApp(numero);
                        }}
                        maxLength={15}
                        disabled={loading}
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Apenas números (DDD + número). Ex: 11999999999
                      </p>
                    </div>

                    <Button 
                      onClick={enviarCodigo} 
                      disabled={loading || !numeroWhatsApp.trim()}
                      className="w-full"
                    >
                      {loading ? "Enviando..." : "Enviar Código de Verificação"}
                    </Button>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        Código de Verificação
                      </label>
                      <Input
                        placeholder="123456"
                        value={codigoVerificacao}
                        onChange={(e) => {
                          const codigo = e.target.value.replace(/\D/g, '');
                          setCodigoVerificacao(codigo);
                        }}
                        maxLength={6}
                        disabled={loading}
                        className="text-center text-xl tracking-widest"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Verifique seu WhatsApp {formatarNumero(numeroWhatsApp)}
                      </p>
                    </div>

                    <div className="flex gap-2">
                      <Button 
                        variant="outline"
                        onClick={() => setEtapaVerificacao('numero')} 
                        disabled={loading}
                        className="flex-1"
                      >
                        Voltar
                      </Button>
                      <Button 
                        onClick={verificarCodigo} 
                        disabled={loading || codigoVerificacao.length !== 6}
                        className="flex-1"
                      >
                        {loading ? "Verificando..." : "Verificar Código"}
                      </Button>
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