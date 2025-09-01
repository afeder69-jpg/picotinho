import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Smartphone, MessageSquare, Minus } from "lucide-react";
import PicotinhoLogo from "@/components/PicotinhoLogo";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { toast } from "sonner";

// Fixed: WhatsApp Config simplified for end users

export default function WhatsAppConfig() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [numeroWhatsApp, setNumeroWhatsApp] = useState("");
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
                onClick={salvarConfig} 
                disabled={loading || !numeroWhatsApp.trim()}
                className="w-full"
              >
                {loading ? "Salvando..." : "Salvar Número"}
              </Button>
            </CardContent>
          </Card>

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