import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Smartphone } from "lucide-react";
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

        </div>
      </div>
    </div>
  );
}