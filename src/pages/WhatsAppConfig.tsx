import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ArrowLeft, Smartphone, Shield, CheckCircle, Plus, Trash2, UserCheck, Bell } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import PicotinhoLogo from "@/components/PicotinhoLogo";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { toast } from "sonner";
import {
  normalizarTelefoneBR,
  validarCelularBR,
  formatarTelefoneBR,
  extrairNumeroNacional,
  telefonesIguais,
  erroTelefoneAmigavel,
} from "@/lib/telefone";

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

interface TelefoneAutorizado {
  id: string;
  numero_whatsapp: string;
  tipo: 'principal' | 'extra';
  verificado: boolean;
  codigo_verificacao?: string;
  data_codigo?: string;
  ativo: boolean;
  created_at: string;
  pref_promocoes: boolean;
  pref_novidades: boolean;
  pref_avisos_estoque: boolean;
  pref_dicas: boolean;
  nome_pessoa: string | null;
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
  const codigoInputRef = useRef<HTMLInputElement>(null);
  
  // Estados para múltiplos telefones
  const [telefones, setTelefones] = useState<TelefoneAutorizado[]>([]);
  const [novoNumero, setNovoNumero] = useState("");
  const [codigoVerificacaoExtra, setCodigoVerificacaoExtra] = useState("");
  const [loadingVerificacaoExtra, setLoadingVerificacaoExtra] = useState(false);
  const [aguardandoCodigoExtra, setAguardandoCodigoExtra] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState<string | null>(null);

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
      loadTelefones();
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
        // Exibir sem o 55 no input
        setNumeroWhatsApp(extrairNumeroNacional(data.numero_whatsapp || ""));
        
        // Verificar se há número pendente
        let webhookData = null;
        try {
          webhookData = data.webhook_token ? JSON.parse(data.webhook_token) : null;
        } catch (e) {
          // webhook_token não é JSON, ignorar
        }
        
        if (webhookData?.numero_pendente) {
          setNumeroPendente(webhookData.numero_pendente);
          setNumeroWhatsApp(extrairNumeroNacional(webhookData.numero_pendente));
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

  const validarEEnviar = (numero: string): string | null => {
    const erro = erroTelefoneAmigavel(numero);
    if (erro) {
      toast.error(erro);
      return null;
    }
    if (!validarCelularBR(numero)) {
      toast.error("Número de celular brasileiro inválido. Verifique o DDD e o número.");
      return null;
    }
    const normalizado = normalizarTelefoneBR(numero);
    if (!normalizado) {
      toast.error("Não foi possível normalizar o número. Digite DDD + número (ex: 21 99999-9999)");
      return null;
    }
    return normalizado;
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
    
    const normalizado = validarEEnviar(numeroWhatsApp);
    if (!normalizado) return;
    
    // Se está tentando mudar um número já verificado, pedir confirmação
    if (configExistente?.verificado && !telefonesIguais(numeroWhatsApp, configExistente.numero_whatsapp)) {
      setShowConfirmDialog(true);
      return;
    }
    
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('enviar-codigo-verificacao', {
        body: {
          numero_whatsapp: normalizado
        }
      });

      if (error) throw error;

      if (data?.success) {
        toast.success("Código de verificação enviado! Verifique seu WhatsApp.");
        setAguardandoCodigo(true);
        loadConfig();
        
        if (data.codigo_debug) {
          toast.info(`Código para teste: ${data.codigo_debug}`, {
            duration: 10000,
          });
        }
      } else {
        throw new Error(data?.error || 'Erro ao enviar código');
      }
    } catch (error: any) {
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
        setNumeroPendente("");
        loadConfig();
      } else {
        throw new Error(data?.error || 'Erro ao verificar código');
      }
    } catch (error: any) {
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
    
    setTimeout(() => {
      codigoInputRef.current?.focus();
    }, 100);
  };

  const procederEnvioCodigo = async () => {
    const normalizado = validarEEnviar(numeroWhatsApp);
    if (!normalizado) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('enviar-codigo-verificacao', {
        body: {
          numero_whatsapp: normalizado
        }
      });

      if (error) throw error;

      if (data?.success) {
        toast.success("Código de verificação enviado! Verifique seu WhatsApp.");
        setAguardandoCodigo(true);
        loadConfig();
        
        if (data.codigo_debug) {
          toast.info(`Código para teste: ${data.codigo_debug}`, {
            duration: 10000,
          });
        }
      } else {
        throw new Error(data?.error || 'Erro ao enviar código');
      }
    } catch (error: any) {
      console.error('Erro ao enviar código:', error);
      toast.error(error.message || "Erro ao enviar código de verificação");
    }
    setLoading(false);
  };

  // Funções para múltiplos telefones
  const loadTelefones = async () => {
    try {
      const { data, error } = await supabase
        .from('whatsapp_telefones_autorizados')
        .select('*')
        .eq('usuario_id', user?.id)
        .eq('ativo', true)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setTelefones((data || []) as TelefoneAutorizado[]);
      
      const pendente = data?.find(t => !t.verificado && t.codigo_verificacao);
      if (pendente) {
        setAguardandoCodigoExtra(pendente.id);
      }
    } catch (error) {
      console.error('Erro ao carregar telefones:', error);
      toast.error("Erro ao carregar telefones autorizados");
    }
  };

  const adicionarTelefone = async () => {
    if (!user) {
      toast.error("Usuário não autenticado");
      return;
    }
    
    if (!novoNumero.trim()) {
      toast.error("Por favor, informe o número do WhatsApp");
      return;
    }
    
    const normalizado = validarEEnviar(novoNumero);
    if (!normalizado) return;

    // Verificar se não é duplicado
    if (telefones.some(t => telefonesIguais(t.numero_whatsapp, normalizado))) {
      toast.error("Este número já está cadastrado");
      return;
    }

    // Verificar limite de 3 telefones
    if (telefones.length >= 3) {
      toast.error("Máximo de 3 telefones autorizados por conta");
      return;
    }
    
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('enviar-codigo-verificacao', {
        body: {
          numero_whatsapp: normalizado
        }
      });

      if (error) throw error;

      if (data?.success) {
        toast.success("Código de verificação enviado! Verifique o WhatsApp.");
        setCodigoVerificacaoExtra("");
        loadTelefones();
        
        if (data.codigo_debug) {
          toast.info(`Código para teste: ${data.codigo_debug}`, {
            duration: 10000,
          });
        }
      } else {
        throw new Error(data?.error || 'Erro ao enviar código');
      }
    } catch (error: any) {
      console.error('Erro ao enviar código:', error);
      toast.error(error.message || "Erro ao enviar código de verificação");
    }
    setLoading(false);
  };

  const verificarCodigoExtra = async () => {
    if (!codigoVerificacaoExtra.trim() || codigoVerificacaoExtra.length !== 6) {
      toast.error("Por favor, digite o código de 6 dígitos");
      return;
    }

    setLoadingVerificacaoExtra(true);
    try {
      const { data, error } = await supabase.functions.invoke('verificar-codigo-whatsapp', {
        body: {
          codigo: codigoVerificacaoExtra.trim()
        }
      });

      if (error) throw error;

      if (data?.success) {
        toast.success(`Telefone ${data.tipo_telefone} verificado com sucesso! 🎉`);
        setAguardandoCodigoExtra(null);
        setCodigoVerificacaoExtra("");
        setNovoNumero("");
        loadTelefones();
      } else {
        throw new Error(data?.error || 'Erro ao verificar código');
      }
    } catch (error: any) {
      console.error('Erro ao verificar código:', error);
      toast.error(error.message || "Erro ao verificar código");
    }
    setLoadingVerificacaoExtra(false);
  };

  const removerTelefone = async (telefoneId: string) => {
    const telefone = telefones.find(t => t.id === telefoneId);
    if (!telefone) return;

    if (telefone.tipo === 'principal' && telefones.filter(t => t.verificado).length === 1) {
      toast.error("Não é possível remover o único telefone principal verificado. Adicione outro telefone primeiro.");
      return;
    }

    try {
      const { error } = await supabase
        .from('whatsapp_telefones_autorizados')
        .update({ ativo: false })
        .eq('id', telefoneId);

      if (error) throw error;

      toast.success("Telefone removido com sucesso");
      setShowDeleteDialog(null);
      loadTelefones();
    } catch (error) {
      console.error('Erro ao remover telefone:', error);
      toast.error("Erro ao remover telefone");
    }
  };

  const reenviarCodigoExtra = async (telefoneId: string) => {
    const telefone = telefones.find(t => t.id === telefoneId);
    if (!telefone) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('enviar-codigo-verificacao', {
        body: {
          numero_whatsapp: telefone.numero_whatsapp
        }
      });

      if (error) throw error;

      if (data?.success) {
        toast.success("Código reenviado! Verifique o WhatsApp.");
        loadTelefones();
        
        if (data.codigo_debug) {
          toast.info(`Código para teste: ${data.codigo_debug}`, {
            duration: 10000,
          });
        }
      } else {
        throw new Error(data?.error || 'Erro ao reenviar código');
      }
    } catch (error: any) {
      console.error('Erro ao reenviar código:', error);
      toast.error(error.message || "Erro ao reenviar código");
    }
    setLoading(false);
  };

  const telefonePendente = telefones.find(t => !t.verificado && t.codigo_verificacao);

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
                  Seu número {formatarTelefoneBR(configExistente.numero_whatsapp)} está ativo e pode receber comandos do Picotinho
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
                  Número ativo: {formatarTelefoneBR(configExistente?.numero_whatsapp || "")} <br/>
                  Aguardando verificação: {formatarTelefoneBR(numeroPendente)}
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
                    placeholder="21 99999-9999"
                    value={numeroWhatsApp}
                    onChange={(e) => {
                      const numero = e.target.value.replace(/\D/g, '').slice(0, 11);
                      setNumeroWhatsApp(numero);
                      if (configExistente && !telefonesIguais(numero, configExistente.numero_whatsapp)) {
                        setAguardandoCodigo(false);
                        setCodigoVerificacao("");
                      }
                    }}
                    maxLength={15}
                  />
                <p className="text-xs text-gray-500 mt-1">
                  DDD + número (ex: 21 99999-9999). O código do Brasil (+55) é adicionado automaticamente.
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
                        Enviamos um código de 6 dígitos para {formatarTelefoneBR(numeroWhatsApp)}. 
                        Digite o código abaixo para verificar seu número.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium mb-2">
                          Código de Verificação
                        </label>
                        <Input
                          ref={codigoInputRef}
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

          {/* Lista de Telefones Autorizados */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserCheck className="h-5 w-5" />
                Telefones Autorizados ({telefones.length}/3)
              </CardTitle>
              <CardDescription>
                Telefones que podem enviar comandos para o Picotinho via WhatsApp
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {telefones.length === 0 ? (
                <p className="text-gray-500 text-center py-4">
                  Nenhum telefone autorizado. Configure um telefone acima.
                </p>
              ) : (
                telefones.map((telefone) => (
                  <div key={telefone.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <Smartphone className="h-5 w-5 text-gray-500" />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{formatarTelefoneBR(telefone.numero_whatsapp)}</span>
                          <Badge variant={telefone.tipo === 'principal' ? 'default' : 'secondary'}>
                            {telefone.tipo === 'principal' ? 'Principal' : 'Extra'}
                          </Badge>
                          {telefone.verificado ? (
                            <Badge className="bg-green-100 text-green-800 border-green-200">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Verificado
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-orange-600 border-orange-200">
                              <Shield className="h-3 w-3 mr-1" />
                              Pendente
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-gray-500">
                          Adicionado em {new Date(telefone.created_at).toLocaleDateString('pt-BR')}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {!telefone.verificado && telefone.codigo_verificacao && (
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => reenviarCodigoExtra(telefone.id)}
                          disabled={loading}
                        >
                          Reenviar Código
                        </Button>
                      )}
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => setShowDeleteDialog(telefone.id)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Preferências de Mensagens */}
          {telefones.filter(t => t.verificado).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bell className="h-5 w-5" />
                  Preferências de Mensagens
                </CardTitle>
                <CardDescription>
                  Escolha quais tipos de mensagens proativas cada telefone recebe
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {telefones.filter(t => t.verificado).map((telefone) => (
                  <div key={`pref-${telefone.id}`} className="p-4 border rounded-lg space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{formatarTelefoneBR(telefone.numero_whatsapp)}</span>
                        <Badge variant={telefone.tipo === 'principal' ? 'default' : 'secondary'}>
                          {telefone.tipo === 'principal' ? 'Principal' : 'Extra'}
                        </Badge>
                        {telefone.nome_pessoa && (
                          <span className="text-sm text-muted-foreground">({telefone.nome_pessoa})</span>
                        )}
                      </div>
                    </div>

                    {/* Campo nome_pessoa */}
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">
                        Nome da pessoa neste telefone
                      </label>
                      <Input
                        placeholder="Ex: Camila, Cozinheira, João"
                        value={telefone.nome_pessoa || ""}
                        onChange={async (e) => {
                          const novoNome = e.target.value;
                          setTelefones(prev => prev.map(t => t.id === telefone.id ? { ...t, nome_pessoa: novoNome } : t));
                        }}
                        onBlur={async (e) => {
                          const novoNome = e.target.value || null;
                          await supabase
                            .from('whatsapp_telefones_autorizados')
                            .update({ nome_pessoa: novoNome } as any)
                            .eq('id', telefone.id);
                        }}
                        className="h-8 text-sm"
                      />
                    </div>

                    {/* Checkboxes de preferências */}
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { key: 'pref_promocoes' as const, label: 'Promoções e ofertas' },
                        { key: 'pref_novidades' as const, label: 'Novidades do Picotinho' },
                        { key: 'pref_avisos_estoque' as const, label: 'Avisos de estoque' },
                        { key: 'pref_dicas' as const, label: 'Dicas e sugestões' },
                      ].map(({ key, label }) => (
                        <label key={key} className="flex items-center gap-2 cursor-pointer">
                          <Checkbox
                            checked={telefone[key]}
                            onCheckedChange={async (checked) => {
                              const newValue = checked === true;
                              setTelefones(prev => prev.map(t => t.id === telefone.id ? { ...t, [key]: newValue } : t));
                              await supabase
                                .from('whatsapp_telefones_autorizados')
                                .update({ [key]: newValue } as any)
                                .eq('id', telefone.id);
                            }}
                          />
                          <span className="text-sm">{label}</span>
                        </label>
                      ))}
                    </div>

                    {/* Botões marcar/desmarcar tudo */}
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          const updates = { pref_promocoes: true, pref_novidades: true, pref_avisos_estoque: true, pref_dicas: true };
                          setTelefones(prev => prev.map(t => t.id === telefone.id ? { ...t, ...updates } : t));
                          await supabase.from('whatsapp_telefones_autorizados').update(updates as any).eq('id', telefone.id);
                          toast.success("Todas as mensagens ativadas");
                        }}
                      >
                        Marcar tudo
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          const updates = { pref_promocoes: false, pref_novidades: false, pref_avisos_estoque: false, pref_dicas: false };
                          setTelefones(prev => prev.map(t => t.id === telefone.id ? { ...t, ...updates } : t));
                          await supabase.from('whatsapp_telefones_autorizados').update(updates as any).eq('id', telefone.id);
                          toast.success("Todas as mensagens desativadas");
                        }}
                      >
                        Desmarcar tudo
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
          {/* Verificação de Código Pendente para Telefones Extras */}
          {telefonePendente && (
            <Card className="border-blue-200 bg-blue-50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-blue-800">
                  <Shield className="h-5 w-5" />
                  Verificação Pendente - Telefone Extra
                </CardTitle>
                <CardDescription className="text-blue-700">
                  Digite o código de 6 dígitos enviado para {formatarTelefoneBR(telefonePendente.numero_whatsapp)}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Código de Verificação
                  </label>
                  <Input
                    placeholder="000000"
                    value={codigoVerificacaoExtra}
                    onChange={(e) => {
                      const codigo = e.target.value.replace(/\D/g, '').slice(0, 6);
                      setCodigoVerificacaoExtra(codigo);
                    }}
                    maxLength={6}
                    className="text-center text-lg tracking-widest"
                  />
                </div>

                <div className="flex gap-2">
                  <Button 
                    onClick={verificarCodigoExtra} 
                    disabled={loadingVerificacaoExtra || codigoVerificacaoExtra.length !== 6}
                    className="flex-1"
                  >
                    {loadingVerificacaoExtra ? "Verificando..." : "Verificar Código"}
                  </Button>
                  <Button 
                    variant="outline"
                    onClick={() => reenviarCodigoExtra(telefonePendente.id)}
                    disabled={loading}
                  >
                    Reenviar
                  </Button>
                </div>

                <p className="text-xs text-blue-600 text-center">
                  O código expira em 10 minutos.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Adicionar Novo Telefone */}
          {telefones.length < 3 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Plus className="h-5 w-5" />
                  Adicionar Telefone Extra
                </CardTitle>
                <CardDescription>
                  Adicione até {3 - telefones.length} telefone{3 - telefones.length !== 1 ? 's' : ''} adiciona{3 - telefones.length === 1 ? 'l' : 'is'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Número do WhatsApp Extra
                  </label>
                  <Input
                    placeholder="21 99999-9999"
                    value={novoNumero}
                    onChange={(e) => {
                      const numero = e.target.value.replace(/\D/g, '').slice(0, 11);
                      setNovoNumero(numero);
                    }}
                    maxLength={15}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    DDD + número (ex: 21 99999-9999). O código do Brasil (+55) é adicionado automaticamente.
                  </p>
                </div>

                <Button 
                  onClick={adicionarTelefone} 
                  disabled={loading || !novoNumero.trim() || !!aguardandoCodigoExtra}
                  className="w-full"
                >
                  {loading ? "Enviando código..." : "Adicionar Telefone"}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Instruções de Uso */}
          {(configExistente?.verificado || aguardandoCodigo || telefones.some(t => t.verificado)) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-green-800">
                  📱 Como funciona:
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm space-y-2">
                  <p><strong>Telefone Principal:</strong> O primeiro telefone cadastrado (normalmente do dono da conta)</p>
                  <p><strong>Telefones Extras:</strong> Até 2 telefones adicionais (familiares, funcionários, etc.)</p>
                  <p><strong>Comandos:</strong> Todos os telefones verificados podem enviar comandos como "baixar 1kg banana"</p>
                  <p><strong>Acesso ao App:</strong> Apenas o dono da conta tem acesso aos relatórios e configurações</p>
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

      {/* Dialog de Confirmação para Remoção de Telefone */}
      <AlertDialog open={!!showDeleteDialog} onOpenChange={() => setShowDeleteDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover Telefone</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover este telefone? Ele não poderá mais enviar comandos para o Picotinho.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => showDeleteDialog && removerTelefone(showDeleteDialog)}
              className="bg-red-600 hover:bg-red-700"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
