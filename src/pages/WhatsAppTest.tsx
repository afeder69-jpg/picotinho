import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Send, User, Bot } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Message {
  id: string;
  type: 'user' | 'bot';
  content: string;
  timestamp: Date;
  command?: string;
}

export default function WhatsAppTest() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      type: 'bot',
      content: 'Olá! Eu sou o Picotinho 🛒 Seu assistente de compras inteligente. Digite comandos como:\n\n• "Picotinho, baixa do estoque 1kg de banana"\n• "Picotinho, consulta estoque"\n• "Picotinho, adiciona 2kg de maçã"',
      timestamp: new Date()
    }
  ]);
  
  const [currentMessage, setCurrentMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const detectCommand = (text: string) => {
    const textoLimpo = text.toLowerCase().trim();
    
    if (textoLimpo.includes('picotinho')) {
      if (textoLimpo.includes('baixa') || textoLimpo.includes('baixar')) {
        return 'baixar_estoque';
      }
      if (textoLimpo.includes('consulta') || textoLimpo.includes('ver') || textoLimpo.includes('mostrar')) {
        return 'consultar_estoque';
      }
      if (textoLimpo.includes('adiciona') || textoLimpo.includes('inserir') || textoLimpo.includes('cadastrar')) {
        return 'adicionar_produto';
      }
    }
    
    return undefined;
  };

  const simulateBot = async (userMessage: string, command?: string) => {
    setIsLoading(true);
    
    // Simular delay de resposta
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    let botResponse = '';
    
    switch (command) {
      case 'baixar_estoque':
        // Extrair produto do texto
        const produtoMatch = userMessage.match(/baixa?.*?do estoque.*?([0-9,]+\s*(?:kg|g|un|unidade|litro|l|ml)?\s+(?:de\s+)?(.+))/i);
        if (produtoMatch) {
          const quantidade = produtoMatch[1];
          const produto = produtoMatch[2];
          botResponse = `✅ Produto baixado do estoque!\n\n📦 ${quantidade} de ${produto}\n\n💡 Estoque atualizado automaticamente.`;
        } else {
          botResponse = '❌ Não consegui identificar o produto e quantidade. Tente: "Picotinho, baixa do estoque 1kg de banana"';
        }
        break;
        
      case 'consultar_estoque':
        botResponse = `📊 Seu estoque atual:\n\n🍌 Banana: 5kg\n🍎 Maçã: 3kg\n🥕 Cenoura: 2kg\n🥛 Leite: 4 litros\n🍞 Pão: 6 unidades\n\n💰 Valor total: R$ 127,50`;
        break;
        
      case 'adicionar_produto':
        const adicionarMatch = userMessage.match(/adiciona?.*?([0-9,]+\s*(?:kg|g|un|unidade|litro|l|ml)?\s+(?:de\s+)?(.+))/i);
        if (adicionarMatch) {
          const quantidade = adicionarMatch[1];
          const produto = adicionarMatch[2];
          botResponse = `✅ Produto adicionado ao estoque!\n\n📦 ${quantidade} de ${produto}\n\n💡 Estoque atualizado automaticamente.`;
        } else {
          botResponse = '❌ Não consegui identificar o produto e quantidade. Tente: "Picotinho, adiciona 2kg de maçã"';
        }
        break;
        
      default:
        if (userMessage.toLowerCase().includes('picotinho')) {
          botResponse = '🤔 Comando não reconhecido. Tente:\n\n• "baixa do estoque [quantidade] de [produto]"\n• "consulta estoque"\n• "adiciona [quantidade] de [produto]"';
        } else {
          botResponse = '👋 Para usar meus comandos, comece a mensagem com "Picotinho"!\n\nExemplo: "Picotinho, baixa do estoque 1kg de banana"';
        }
    }
    
    setIsLoading(false);
    
    return {
      id: Date.now().toString(),
      type: 'bot' as const,
      content: botResponse,
      timestamp: new Date()
    };
  };

  const sendMessage = async () => {
    if (!currentMessage.trim()) return;
    
    const command = detectCommand(currentMessage);
    
    // Adicionar mensagem do usuário
    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: currentMessage,
      timestamp: new Date(),
      command
    };
    
    setMessages(prev => [...prev, userMessage]);
    
    // Simular resposta do bot
    const botMessage = await simulateBot(currentMessage, command);
    setMessages(prev => [...prev, botMessage]);
    
    setCurrentMessage('');
    
    // Salvar no banco para teste
    try {
      await supabase.from('whatsapp_mensagens').insert({
        remetente: '21970016024', // Número de teste
        conteudo: currentMessage,
        tipo_mensagem: 'text',
        comando_identificado: command,
        webhook_data: { 
          teste: true, 
          interface: 'web_simulator',
          timestamp: new Date().toISOString() 
        }
      });
    } catch (error) {
      console.error('Erro ao salvar mensagem de teste:', error);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-blue-50 p-4">
      <div className="max-w-4xl mx-auto">
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-6 w-6 text-emerald-600" />
              Simulador WhatsApp - Picotinho
            </CardTitle>
            <CardDescription>
              Teste os comandos do Picotinho como se fosse no WhatsApp real
            </CardDescription>
          </CardHeader>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Chat Simulator */}
          <Card className="h-[600px] flex flex-col">
            <CardHeader className="bg-emerald-600 text-white rounded-t-lg">
              <CardTitle className="text-lg">💬 Chat com Picotinho</CardTitle>
            </CardHeader>
            
            <CardContent className="flex-1 flex flex-col p-0">
              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-lg p-3 ${
                        message.type === 'user'
                          ? 'bg-emerald-500 text-white'
                          : 'bg-gray-100 text-gray-900'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        {message.type === 'user' ? (
                          <User className="h-4 w-4" />
                        ) : (
                          <Bot className="h-4 w-4" />
                        )}
                        <span className="text-xs opacity-75">
                          {message.type === 'user' ? 'Você' : 'Picotinho'}
                        </span>
                        {message.command && (
                          <Badge variant="secondary" className="text-xs">
                            {message.command}
                          </Badge>
                        )}
                      </div>
                      <div className="whitespace-pre-wrap">{message.content}</div>
                      <div className="text-xs opacity-50 mt-1">
                        {message.timestamp.toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                ))}
                
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="bg-gray-100 rounded-lg p-3">
                      <div className="flex items-center gap-2">
                        <Bot className="h-4 w-4" />
                        <span className="text-sm">Picotinho está digitando...</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              
              {/* Input */}
              <div className="p-4 border-t">
                <div className="flex gap-2">
                  <Input
                    value={currentMessage}
                    onChange={(e) => setCurrentMessage(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="Digite sua mensagem para o Picotinho..."
                    disabled={isLoading}
                  />
                  <Button onClick={sendMessage} disabled={isLoading || !currentMessage.trim()}>
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Commands Guide */}
          <Card>
            <CardHeader>
              <CardTitle>📚 Comandos Disponíveis</CardTitle>
              <CardDescription>
                Liste de comandos que o Picotinho reconhece
              </CardDescription>
            </CardHeader>
            
            <CardContent className="space-y-4">
              <div>
                <h4 className="font-semibold text-sm text-emerald-600 mb-2">🔻 Baixar do Estoque</h4>
                <div className="space-y-1">
                  <code className="text-xs bg-gray-100 px-2 py-1 rounded block">
                    "Picotinho, baixa do estoque 1kg de banana"
                  </code>
                  <code className="text-xs bg-gray-100 px-2 py-1 rounded block">
                    "Picotinho, baixar 2 litros de leite"
                  </code>
                </div>
              </div>

              <div>
                <h4 className="font-semibold text-sm text-blue-600 mb-2">📊 Consultar Estoque</h4>
                <div className="space-y-1">
                  <code className="text-xs bg-gray-100 px-2 py-1 rounded block">
                    "Picotinho, consulta estoque"
                  </code>
                  <code className="text-xs bg-gray-100 px-2 py-1 rounded block">
                    "Picotinho, ver estoque"
                  </code>
                </div>
              </div>

              <div>
                <h4 className="font-semibold text-sm text-purple-600 mb-2">➕ Adicionar Produto</h4>
                <div className="space-y-1">
                  <code className="text-xs bg-gray-100 px-2 py-1 rounded block">
                    "Picotinho, adiciona 3kg de maçã"
                  </code>
                  <code className="text-xs bg-gray-100 px-2 py-1 rounded block">
                    "Picotinho, inserir 5 unidades de pão"
                  </code>
                </div>
              </div>

              <div className="mt-6 p-4 bg-yellow-50 rounded-lg">
                <h4 className="font-semibold text-sm text-yellow-700 mb-2">💡 Dicas</h4>
                <ul className="text-xs text-yellow-600 space-y-1">
                  <li>• Sempre comece com "Picotinho"</li>
                  <li>• Inclua quantidade e unidade (kg, g, litros, unidades)</li>
                  <li>• Use linguagem natural</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}