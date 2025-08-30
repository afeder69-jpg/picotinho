-- Criar tabela para armazenar mensagens do WhatsApp
CREATE TABLE public.whatsapp_mensagens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  usuario_id UUID REFERENCES auth.users(id),
  remetente TEXT NOT NULL, -- Número do WhatsApp que enviou
  conteudo TEXT NOT NULL, -- Conteúdo da mensagem
  tipo_mensagem TEXT NOT NULL DEFAULT 'text', -- text, image, audio, etc.
  webhook_data JSONB, -- Dados completos do webhook para debug
  processada BOOLEAN NOT NULL DEFAULT false, -- Se já foi processada por algum comando
  comando_identificado TEXT, -- Comando identificado (ex: "baixar_estoque")
  parametros_comando JSONB, -- Parâmetros extraídos do comando
  resposta_enviada TEXT, -- Resposta que foi enviada de volta
  erro_processamento TEXT, -- Erros durante processamento
  data_recebimento TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  data_processamento TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Criar índices para performance
CREATE INDEX idx_whatsapp_mensagens_remetente ON public.whatsapp_mensagens(remetente);
CREATE INDEX idx_whatsapp_mensagens_data_recebimento ON public.whatsapp_mensagens(data_recebimento);
CREATE INDEX idx_whatsapp_mensagens_processada ON public.whatsapp_mensagens(processada);
CREATE INDEX idx_whatsapp_mensagens_usuario_id ON public.whatsapp_mensagens(usuario_id);

-- Habilitar RLS
ALTER TABLE public.whatsapp_mensagens ENABLE ROW LEVEL SECURITY;

-- Políticas RLS - usuários só veem suas próprias mensagens
CREATE POLICY "Usuários podem ver suas mensagens WhatsApp" 
ON public.whatsapp_mensagens 
FOR SELECT 
USING (auth.uid() = usuario_id);

CREATE POLICY "Sistema pode inserir mensagens WhatsApp" 
ON public.whatsapp_mensagens 
FOR INSERT 
WITH CHECK (true); -- Edge function vai inserir com service role

CREATE POLICY "Sistema pode atualizar mensagens WhatsApp" 
ON public.whatsapp_mensagens 
FOR UPDATE 
USING (true); -- Edge function vai atualizar com service role

-- Criar tabela para configurações do WhatsApp por usuário
CREATE TABLE public.whatsapp_configuracoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  usuario_id UUID NOT NULL REFERENCES auth.users(id),
  numero_whatsapp TEXT NOT NULL, -- Número registrado do usuário
  ativo BOOLEAN NOT NULL DEFAULT true,
  api_provider TEXT NOT NULL DEFAULT 'z-api', -- z-api, twilio, meta
  webhook_token TEXT, -- Token para validar webhooks
  ultima_mensagem TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  UNIQUE(usuario_id)
);

-- Habilitar RLS
ALTER TABLE public.whatsapp_configuracoes ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para configurações
CREATE POLICY "Usuários podem gerenciar suas configurações WhatsApp" 
ON public.whatsapp_configuracoes 
FOR ALL 
USING (auth.uid() = usuario_id)
WITH CHECK (auth.uid() = usuario_id);

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_whatsapp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_whatsapp_mensagens_updated_at
    BEFORE UPDATE ON public.whatsapp_mensagens
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_whatsapp();

CREATE TRIGGER update_whatsapp_configuracoes_updated_at
    BEFORE UPDATE ON public.whatsapp_configuracoes
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_whatsapp();

-- Comentários para documentação
COMMENT ON TABLE public.whatsapp_mensagens IS 'Armazena todas as mensagens recebidas via WhatsApp para processamento';
COMMENT ON TABLE public.whatsapp_configuracoes IS 'Configurações do WhatsApp por usuário para integração';