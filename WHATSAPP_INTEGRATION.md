# 📱 Integração WhatsApp - Picotinho

Este documento descreve a implementação completa da integração WhatsApp com o sistema Picotinho.

## 🎯 Funcionalidades Implementadas

### ✅ Webhook de Recebimento (whatsapp-webhook)
- **Endpoint**: `/functions/v1/whatsapp-webhook`
- **Suporte Multi-provedor**: Z-API, Twilio, Meta WhatsApp Cloud API
- **Identificação de Comandos**: Reconhece comandos básicos do Picotinho
- **Armazenamento**: Salva mensagens na tabela `whatsapp_mensagens`

### ✅ Mensagem de Boas-vindas Automática (send-welcome-whatsapp)
- **Endpoint**: `/functions/v1/send-welcome-whatsapp`
- **Trigger**: Enviada automaticamente no primeiro cadastro do número
- **Personalização**: Inclui nome do usuário se disponível
- **Conteúdo**: Mensagem explicativa sobre como usar o Picotinho

### ✅ Interface de Configuração (WhatsAppConfig)
- **Localização**: `/whatsapp`
- **Funcionalidades**:
  - Cadastro simples do número WhatsApp
  - Lista de comandos disponíveis
  - Validação e formatação automática
  - Envio automático de boas-vindas

## 🏗️ Arquitetura

### Edge Functions
1. **whatsapp-webhook**: Recebe e processa mensagens
2. **send-welcome-whatsapp**: Envia mensagem de boas-vindas

### Tabelas do Banco
1. **whatsapp_configuracoes**: Configurações por usuário
2. **whatsapp_mensagens**: Histórico de mensagens recebidas

### Configurações Globais
- Provedor de API: Z-API (configurável)
- Token: Gerenciado via secrets do Supabase
- Webhook: Configurado automaticamente

## 🚀 Como Usar

### Para Usuários Finais
1. Acesse `/whatsapp` no menu
2. Digite seu número (DDD + número)
3. Clique em "Salvar Número"
4. **Receba mensagem de boas-vindas automaticamente! 🎉**
5. Comece a usar comandos como:
   - "Picotinho, baixa do estoque 1kg de banana prata"
   - "Picotinho, dar baixa em 2 unidades de leite integral"

### Para Administradores
1. Configure o token da API do WhatsApp (`WHATSAPP_API_TOKEN`)
2. Configure a instância da Z-API (ou outro provedor)
3. **Configure o avatar/logo do Picotinho via interface da API**

## ⚙️ Configuração Técnica

### Secrets Necessários
- `WHATSAPP_API_TOKEN`: Token da API do WhatsApp

### Webhook URL
```
https://mjsbwrtegorjxcepvrik.supabase.co/functions/v1/whatsapp-webhook
```

### Comandos Identificados
- `baixar_estoque`: Comandos de baixa no estoque
- `consultar_estoque`: Consultas sobre produtos
- `adicionar_produto`: Adição de produtos

## 🎨 Logo/Avatar do Picotinho

### Configuração Manual (Uma vez pelo administrador)
1. Acesse o painel da Z-API (ou seu provedor)
2. Vá em configurações de perfil/avatar
3. Faça upload do logo oficial do Picotinho
4. Defina como avatar padrão para todas as interações

### Logo Recomendado
- **Formato**: PNG com fundo transparente
- **Tamanho**: 512x512px (quadrado)
- **Estilo**: Ícone redondo com o mascote Picotinho
- **Cores**: Verde/azul do Picotinho para consistência visual

## 📱 Mensagem de Boas-vindas

### Conteúdo Atual
```
👋 Olá, [nome]! Eu sou o Picotinho, assistente das suas compras!

Bem-vindo 🎉 Estou pronto para receber seus comandos.

Exemplo: "Picotinho, baixa do estoque 1kg de banana prata".

Digite "Picotinho" seguido do seu comando para começar! 🛒✨
```

### Características
- **Personalizada**: Inclui nome do usuário quando disponível
- **Educativa**: Explica como usar o sistema
- **Amigável**: Tom caloroso e acolhedor
- **Exemplo prático**: Mostra comando real para começar

## 📱 Provedores Suportados

### Z-API (Padrão)
```javascript
// Formato de webhook
{
  "phone": "5511999999999",
  "message": {
    "conversation": "Mensagem do usuário",
    "messageType": "text"
  }
}
```

### Twilio
```javascript
// Formato de webhook
{
  "From": "whatsapp:+5511999999999",
  "Body": "Mensagem do usuário"
}
```

### Meta WhatsApp Cloud API
```javascript
// Formato de webhook
{
  "entry": [{
    "changes": [{
      "value": {
        "messages": [{
          "from": "5511999999999",
          "text": { "body": "Mensagem do usuário" }
        }]
      }
    }]
  }]
}
```

## 🔒 Segurança

### RLS (Row Level Security)
- Usuários só veem suas próprias configurações
- Mensagens são filtradas por usuário
- Acesso controlado via auth.uid()

### Validações
- Números de telefone são normalizados
- Tokens são protegidos via environment variables
- Webhooks validados conforme provedor

## 🛠️ Próximos Passos

### Comandos em Desenvolvimento
- [ ] Processamento de comandos de baixa de estoque
- [ ] Consulta de preços e disponibilidade
- [ ] Adição de produtos via WhatsApp
- [ ] Relatórios via WhatsApp

### Melhorias Planejadas
- [ ] Suporte a imagens/fotos de produtos
- [ ] Comandos de voz
- [ ] Integração com IA para melhor compreensão
- [ ] Templates de resposta personalizáveis

## 📞 Suporte

Para configuração ou dúvidas sobre a integração WhatsApp:
1. Verifique logs das Edge Functions no Supabase
2. Confirme configuração do webhook no provedor
3. Valide tokens e permissões

## 🎯 Novidades Implementadas

### 🆕 Mensagem de Boas-vindas Automática
- ✅ Enviada automaticamente no primeiro cadastro
- ✅ Personalizada com nome do usuário
- ✅ Explica como usar o Picotinho
- ✅ Integração transparente com a interface

### 🆕 Preparação para Logo do Picotinho
- ✅ Documentação para configuração do avatar
- ✅ Especificações técnicas definidas
- ✅ Processo de configuração única documentado

**O sistema agora oferece uma experiência completa de onboarding via WhatsApp!** 🚀