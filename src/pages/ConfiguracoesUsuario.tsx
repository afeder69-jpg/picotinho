import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import PageHeader from "@/components/PageHeader";
import { 
  ChevronRight, 
  MapPin,
  Settings,
  MessageCircle,
  Shield
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/components/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";

const ConfiguracoesUsuario = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    async function checkAdminRole() {
      if (!user?.id) return;

      const { data: roles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .is('revogado_em', null);

      if (roles) {
        setIsAdmin(roles.some(r => r.role === 'admin'));
      }
    }
    
    checkAdminRole();
  }, [user]);

  const configOptions = [
    {
      id: 'cadastro-usuario',
      title: 'Cadastro do Usuário',
      description: 'Complete suas informações pessoais e endereço',
      icon: Settings,
      onClick: () => navigate('/cadastro-usuario'),
      isActive: true,
      isAdminOnly: false
    },
    {
      id: 'area-atuacao',
      title: 'Área de Atuação',
      description: 'Configurar raio geográfico dos supermercados',
      icon: MapPin,
      onClick: () => navigate('/area-atuacao'),
      isActive: true,
      isAdminOnly: false
    },
    {
      id: 'whatsapp',
      title: 'Integração WhatsApp',
      description: 'Configure comandos do Picotinho via WhatsApp e gerencie múltiplos telefones',
      icon: MessageCircle,
      onClick: () => navigate('/whatsapp'),
      isActive: true,
      isAdminOnly: false
    }
  ];

  // Adicionar opção admin condicionalmente
  const adminOptions = isAdmin ? [{
    id: 'gerenciar-masters',
    title: 'Gerenciar Masters',
    description: 'Promover e gerenciar usuários Masters',
    icon: Shield,
    onClick: () => navigate('/admin/gerenciar-masters'),
    isActive: true,
    isAdminOnly: true
  }] : [];

  const allOptions = [...configOptions, ...adminOptions];

  return (
    <div className="min-h-screen bg-gradient-subtle flex flex-col pb-32">
      <PageHeader title="Configurações do Usuário" />

      {/* Main content area */}
      <div className="flex-1 px-6 pb-8 pt-6">
        <div className="max-w-md mx-auto">
          
          <div className="space-y-3">
            {allOptions.map((option) => (
              <Card 
                key={option.id}
                className={`transition-all duration-200 hover:shadow-md ${
                  option.isActive ? 'cursor-pointer' : 'cursor-default opacity-75'
                } ${
                  option.isAdminOnly ? 'border-2 border-destructive bg-gradient-to-r from-destructive/5 to-destructive/10' : ''
                }`}
                onClick={option.isActive ? option.onClick : undefined}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`p-3 rounded-full ${
                        option.isAdminOnly 
                          ? 'bg-destructive/20' 
                          : option.isActive 
                            ? 'bg-primary/10' 
                            : 'bg-muted'
                      }`}>
                        <option.icon className={`w-6 h-6 ${
                          option.isAdminOnly
                            ? 'text-destructive'
                            : option.isActive 
                              ? 'text-primary' 
                              : 'text-muted-foreground'
                        }`} />
                      </div>
                      <div>
                        <h3 className={`font-semibold flex items-center gap-2 ${
                          option.isAdminOnly 
                            ? 'text-destructive' 
                            : option.isActive 
                              ? 'text-foreground' 
                              : 'text-muted-foreground'
                        }`}>
                          {option.title}
                          {option.isAdminOnly && (
                            <span className="text-xs bg-destructive text-destructive-foreground px-2 py-0.5 rounded">
                              ADMIN
                            </span>
                          )}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {option.description}
                        </p>
                        {!option.isActive && (
                          <p className="text-xs text-muted-foreground/70 mt-1">
                            Em breve
                          </p>
                        )}
                      </div>
                    </div>
                    {option.isActive && (
                      <ChevronRight className={`w-5 h-5 ${
                        option.isAdminOnly ? 'text-destructive' : 'text-muted-foreground'
                      }`} />
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          
          {/* Mensagem informativa */}
          <div className="mt-6 p-4 text-center text-muted-foreground bg-muted/30 rounded-lg">
            <p className="text-sm">
              Mais opções de configuração serão adicionadas em breve
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfiguracoesUsuario;