import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import PicotinhoLogo from "@/components/PicotinhoLogo";
import { 
  ChevronRight, 
  MapPin,
  ArrowLeft,
  Settings,
  MessageCircle
} from "lucide-react";
import { useNavigate } from "react-router-dom";

const ConfiguracoesUsuario = () => {
  const navigate = useNavigate();

  const configOptions = [
    {
      id: 'cadastro-usuario',
      title: 'Cadastro do Usuário',
      description: 'Complete suas informações pessoais e endereço',
      icon: Settings,
      onClick: () => navigate('/cadastro-usuario'),
      isActive: true
    },
    {
      id: 'area-atuacao',
      title: 'Área de Atuação',
      description: 'Configurar raio geográfico dos supermercados',
      icon: MapPin,
      onClick: () => navigate('/area-atuacao'),
      isActive: true
    },
    {
      id: 'whatsapp',
      title: 'Integração WhatsApp',
      description: 'Configure comandos do Picotinho via WhatsApp e gerencie múltiplos telefones',
      icon: MessageCircle,
      onClick: () => navigate('/whatsapp'),
      isActive: true
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-subtle flex flex-col pb-32">
      {/* Header com logo e botão de voltar */}
      <div className="flex justify-between items-center p-4">
        <Button 
          variant="ghost" 
          onClick={() => navigate('/menu')}
          className="flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar
        </Button>
        <PicotinhoLogo />
        <div className="w-16" /> {/* Spacer para centralizar o logo */}
      </div>

      {/* Main content area */}
      <div className="flex-1 px-6 pb-8">
        <div className="max-w-md mx-auto">
          {/* Título da página */}
          <div className="text-center mb-6">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Settings className="w-6 h-6 text-primary" />
              <h1 className="text-2xl font-bold text-foreground">
                Configurações do Usuário
              </h1>
            </div>
            <p className="text-muted-foreground">
              Gerencie suas configurações pessoais
            </p>
          </div>
          
          <div className="space-y-3">
            {configOptions.map((option) => (
              <Card 
                key={option.id}
                className={`transition-all duration-200 hover:shadow-md ${
                  option.isActive ? 'cursor-pointer' : 'cursor-default opacity-75'
                }`}
                onClick={option.isActive ? option.onClick : undefined}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`p-3 rounded-full ${
                        option.isActive ? 'bg-primary/10' : 'bg-muted'
                      }`}>
                        <option.icon className={`w-6 h-6 ${
                          option.isActive ? 'text-primary' : 'text-muted-foreground'
                        }`} />
                      </div>
                      <div>
                        <h3 className={`font-semibold ${
                          option.isActive ? 'text-foreground' : 'text-muted-foreground'
                        }`}>
                          {option.title}
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
                      <ChevronRight className="w-5 h-5 text-muted-foreground" />
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