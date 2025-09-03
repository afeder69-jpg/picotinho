import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ArrowLeft, Smartphone, Shield, CheckCircle } from "lucide-react";
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
  const [numeroWhatsApp, setNumeroWhatsApp] = useState("");
  const [codigoVerificacao, setCodigoVerificacao] = useState("");
  const [configExistente, setConfigExistente] = useState<WhatsAppConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingVerificacao, setLoadingVerificacao] = useState(false);
  const [aguardandoCodigo, setAguardandoCodigo] = useState(false);
  const [numeroPendente, setNumeroPendente] = useState("");
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

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
        .select('*')
        .eq('usuario_id', user?.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setConfigExistente(data);
        setNumeroWhatsApp(data.numero_whatsapp || "");
        
        // Verificar se há número pendente
        let webhookData = null;
        try {
          webhookData = data.webhook_token ? JSON.parse(data.webhook_token) : null;
        } catch (e) {
          // webhook_token não é JSON, ignorar
        }
        
        if (webhookData?.numero_pendente) {
          setNumeroPendente(webhookData.numero_pendente);
          setNumeroWhatsApp(webhookData.numero_pendente);
        }
        
        // Se tem código pendente, mostrar campo de verificação
        if (data.codigo_verificacao && !data.verificado) {
          setAguardandoCodigo(true);
        }
      }
    } catch (error) {
      console.error('Erro ao carregar configuração:', error);
    }
  };

  const salvarEEnviarCodigo = async () => {
    if (!user) {
      toast.error("Usuário não autenticado");
      return;
    }
    
    if (!numeroWhatsApp.trim()) {
      toast.error("Por favor, informe seu número do WhatsApp");
      return;
    }
    
    // Validar formato obrigatório: 13 dígitos começando com 55
    if (numeroWhatsApp.length !== 13 || !numeroWhatsApp.startsWith('55')) {
      toast.error("Formato obrigatório: 5521999999999 (código do país + área + número)");
      return;
    }
    
    // Se está tentando mudar um número já verificado, pedir confirmação
    if (configExistente?.verificado && numeroWhatsApp !== configExistente.numero_whatsapp) {
      setShowConfirmDialog(true);
      return;
    }
    
    setLoading(true);
    try {
      // Enviar código de verificação
      const { data, error } = await supabase.functions.invoke('enviar-codigo-verificacao', {
        body: {
          numero_whatsapp: numeroWhatsApp.trim()
        }
      });

      if (error) throw error;

      if (data?.success) {
        toast.success("Código de verificação enviado! Verifique seu WhatsApp.");
        setAguardandoCodigo(true);
        loadConfig(); // Recarregar para atualizar status
        
        // Em ambiente de desenvolvimento, mostrar o código
        if (data.codigo_debug) {
          toast.info(`Código para teste: ${data.codigo_debug}`, {
            duration: 10000,
          });
        }
      } else {
        throw new Error(data?.error || 'Erro ao enviar código');
      }
    } catch (error) {
      console.error('Erro ao enviar código:', error);
      toast.error(error.message || "Erro ao enviar código de verificação");
    }
    setLoading(false);
  };

  const verificarCodigo = async () => {
    if (!codigoVerificacao.trim() || codigoVerificacao.length !== 6) {
      toast.error("Por favor, digite o código de 6 dígitos");
      return;
    }

    setLoadingVerificacao(true);
    try {
      const { data, error } = await supabase.functions.invoke('verificar-codigo-whatsapp', {
        body: {
          codigo: codigoVerificacao.trim()
        }
      });

      if (error) throw error;

      if (data?.success) {
        toast.success("Número verificado com sucesso! 🎉");
        setAguardandoCodigo(false);
        setCodigoVerificacao("");
        setNumeroPendente(""); // Limpar número pendente
        loadConfig(); // Recarregar configuração
      } else {
        throw new Error(data?.error || 'Erro ao verificar código');
      }
    } catch (error) {
      console.error('Erro ao verificar código:', error);
      toast.error(error.message || "Erro ao verificar código");
    }
    setLoadingVerificacao(false);
  };

  const solicitarNovoCodigo = async () => {
    setCodigoVerificacao("");
    await salvarEEnviarCodigo();
  };

  const confirmarTrocaNumero = async () => {
    setShowConfirmDialog(false);
    await procederEnvioCodigo();
  };

  const procederEnvioCodigo = async () => {
    setLoading(true);
    try {
      // Enviar código de verificação
      const { data, error } = await supabase.functions.invoke('enviar-codigo-verificacao', {
        body: {
          numero_whatsapp: numeroWhatsApp.trim()
        }
      });

      if (error) throw error;

      if (data?.success) {
        toast.success("Código de verificação enviado! Verifique seu WhatsApp.");
        setAguardandoCodigo(true);
        loadConfig(); // Recarregar para atualizar status
        
        // Em ambiente de desenvolvimento, mostrar o código
        if (data.codigo_debug) {
          toast.info(`Código para teste: ${data.codigo_debug}`, {
            duration: 10000,
          });
        }
      } else {
        throw new Error(data?.error || 'Erro ao enviar código');
      }
    } catch (error) {
      console.error('Erro ao enviar código:', error);
      toast.error(error.message || "Erro ao enviar código de verificação");
    }
    setLoading(false);
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
          {/* Status da Verificação */}
          {configExistente?.verificado && !numeroPendente && (
            <Card className="border-green-200 bg-green-50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-green-800">
                  <CheckCircle className="h-5 w-5" />
                  Número Verificado
                </CardTitle>
                <CardDescription className="text-green-700">
                  Seu número {formatarNumero(configExistente.numero_whatsapp)} está ativo e pode receber comandos do Picotinho
                </CardDescription>
              </CardHeader>
            </Card>
          )}
          
          {/* Aviso de Troca Pendente */}
          {numeroPendente && (
            <Card className="border-orange-200 bg-orange-50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-orange-800">
                  <Shield className="h-5 w-5" />
                  Troca de Número Pendente
                </CardTitle>
                <CardDescription className="text-orange-700">
                  Número ativo: {formatarNumero(configExistente?.numero_whatsapp || "")} <br/>
                  Aguardando verificação: {formatarNumero(numeroPendente)}
                </CardDescription>
              </CardHeader>
            </Card>
          )}

          {/* Configuração do Número */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Smartphone className="h-5 w-5" />
                {configExistente?.verificado ? "Alterar Número" : "Configurar Número"}
              </CardTitle>
              <CardDescription>
                {configExistente?.verificado 
                  ? "Digite um novo número se quiser alterar"
                  : "Digite seu número do WhatsApp para receber comandos do Picotinho"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Número do WhatsApp
                </label>
                  <Input
                    placeholder="5521999999999 (formato obrigatório)"
                    value={formatarNumero(numeroWhatsApp)}
                    onChange={(e) => {
                      // Remove formatação antes de salvar
                      const numero = e.target.value.replace(/\D/g, '');
                      setNumeroWhatsApp(numero);
                      // Se mudou o número, cancelar verificação pendente
                      if (numero !== configExistente?.numero_whatsapp) {
                        setAguardandoCodigo(false);
                        setCodigoVerificacao("");
                      }
                    }}
                    maxLength={20}
                  />
                <p className="text-xs text-gray-500 mt-1">
                  <strong>Obrigatório:</strong> Código do país + área + número (13 dígitos: 5521999999999)
                </p>
              </div>

              {!aguardandoCodigo ? (
                <Button 
                  onClick={salvarEEnviarCodigo} 
                  disabled={loading || !numeroWhatsApp.trim()}
                  className="w-full"
                >
                  {loading ? "Enviando código..." : "Enviar Código de Verificação"}
                </Button>
              ) : (
                <>
                  {/* Campo de Verificação */}
                  <Card className="border-blue-200 bg-blue-50">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-blue-800">
                        <Shield className="h-5 w-5" />
                        Verificação Necessária
                      </CardTitle>
                      <CardDescription className="text-blue-700">
                        Enviamos um código de 6 dígitos para {formatarNumero(numeroWhatsApp)}. 
                        Digite o código abaixo para verificar seu número.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium mb-2">
                          Código de Verificação
                        </label>
                        <Input
                          placeholder="000000"
                          value={codigoVerificacao}
                          onChange={(e) => {
                            const codigo = e.target.value.replace(/\D/g, '').slice(0, 6);
                            setCodigoVerificacao(codigo);
                          }}
                          maxLength={6}
                          className="text-center text-lg tracking-widest"
                        />
                      </div>

                      <div className="flex gap-2">
                        <Button 
                          onClick={verificarCodigo} 
                          disabled={loadingVerificacao || codigoVerificacao.length !== 6}
                          className="flex-1"
                        >
                          {loadingVerificacao ? "Verificando..." : "Verificar Código"}
                        </Button>
                        <Button 
                          variant="outline"
                          onClick={solicitarNovoCodigo}
                          disabled={loading}
                        >
                          Reenviar
                        </Button>
                      </div>

                      <p className="text-xs text-blue-600 text-center">
                        O código expira em 10 minutos. Não recebeu? Clique em "Reenviar".
                      </p>
                    </CardContent>
                  </Card>
                </>
              )}
            </CardContent>
          </Card>

          {/* Instruções de Uso */}
          {(configExistente?.verificado || aguardandoCodigo) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-green-800">
                  ✅ Como usar o Picotinho:
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm space-y-2">
                  <p><strong>Baixar estoque:</strong> "Picotinho, baixa 1 quilo de banana"</p>
                  <p><strong>Consultar:</strong> "Picotinho, qual o preço do açúcar?"</p>
                  <p><strong>Adicionar:</strong> "Picotinho, adiciona leite na lista"</p>
                  <p className="text-gray-600 mt-3">
                    💡 Todas as mensagens devem começar com "Picotinho" para serem processadas.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Dialog de Confirmação para Troca de Número */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Troca de Número</AlertDialogTitle>
            <AlertDialogDescription>
              Você já tem um número verificado. Alterar para um novo número irá desativar o anterior. Deseja continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarTrocaNumero}>
              Continuar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}