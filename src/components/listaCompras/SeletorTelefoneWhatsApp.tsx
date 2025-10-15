import { useState, useEffect } from "react";
import { Phone, Check } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface Telefone {
  id: string;
  numero_whatsapp: string;
  tipo: string;
  verificado: boolean;
}

interface SeletorTelefoneWhatsAppProps {
  open: boolean;
  onSelect: (telefoneId: string) => void;
  onCancel: () => void;
}

export function SeletorTelefoneWhatsApp({ open, onSelect, onCancel }: SeletorTelefoneWhatsAppProps) {
  const [telefones, setTelefones] = useState<Telefone[]>([]);
  const [telefonesSelecionado, setTelefoneSelecionado] = useState<string>("");
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    if (open) {
      buscarTelefones();
    }
  }, [open]);

  const buscarTelefones = async () => {
    setCarregando(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('whatsapp_telefones_autorizados')
        .select('*')
        .eq('usuario_id', user.id)
        .eq('verificado', true)
        .eq('ativo', true)
        .order('tipo', { ascending: false }); // Principal primeiro

      if (error) throw error;

      setTelefones(data || []);
      
      // Selecionar principal por padrão
      const principal = data?.find(t => t.tipo === 'principal');
      if (principal) {
        setTelefoneSelecionado(principal.id);
      }
    } catch (error) {
      console.error('Erro ao buscar telefones:', error);
      toast({ 
        title: "Erro ao buscar telefones", 
        variant: "destructive" 
      });
    } finally {
      setCarregando(false);
    }
  };

  const formatarNumero = (numero: string) => {
    // Remove o prefixo 55 se houver
    const numeroLimpo = numero.startsWith('55') ? numero.substring(2) : numero;
    
    // Formata: (XX) XXXXX-XXXX
    if (numeroLimpo.length === 11) {
      return `(${numeroLimpo.substring(0, 2)}) ${numeroLimpo.substring(2, 7)}-${numeroLimpo.substring(7)}`;
    }
    return numeroLimpo;
  };

  const handleEnviar = () => {
    if (!telefonesSelecionado) {
      toast({ 
        title: "Selecione um telefone", 
        variant: "destructive" 
      });
      return;
    }
    onSelect(telefonesSelecionado);
  };

  return (
    <Dialog open={open} onOpenChange={onCancel}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Escolha o número de destino
          </DialogTitle>
        </DialogHeader>

        {carregando ? (
          <div className="text-center py-8 text-muted-foreground">
            Carregando telefones...
          </div>
        ) : telefones.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-muted-foreground mb-4">
              ❌ Você precisa ter pelo menos um telefone WhatsApp verificado
            </p>
            <Button onClick={() => window.location.href = '/whatsapp'}>
              Configurar WhatsApp
            </Button>
          </div>
        ) : (
          <>
            <RadioGroup value={telefonesSelecionado} onValueChange={setTelefoneSelecionado}>
              <div className="space-y-3">
                {telefones.map((telefone) => (
                  <div 
                    key={telefone.id}
                    className="flex items-center space-x-3 border rounded-lg p-3 hover:bg-accent/50 transition-colors cursor-pointer"
                    onClick={() => setTelefoneSelecionado(telefone.id)}
                  >
                    <RadioGroupItem value={telefone.id} id={telefone.id} />
                    <Label 
                      htmlFor={telefone.id} 
                      className="flex-1 cursor-pointer flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">
                          {formatarNumero(telefone.numero_whatsapp)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {telefone.verificado && (
                          <Check className="h-4 w-4 text-green-600" />
                        )}
                        <Badge variant={telefone.tipo === 'principal' ? 'default' : 'secondary'}>
                          {telefone.tipo === 'principal' ? 'Principal' : 'Extra'}
                        </Badge>
                      </div>
                    </Label>
                  </div>
                ))}
              </div>
            </RadioGroup>

            <div className="flex gap-2 mt-4">
              <Button variant="outline" onClick={onCancel} className="flex-1">
                Cancelar
              </Button>
              <Button 
                onClick={handleEnviar} 
                className="flex-1"
                disabled={!telefonesSelecionado}
              >
                Enviar PDF
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
