-- Criar tabela para armazenar imagens completas das notas fiscais
CREATE TABLE public.notas_imagens (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    usuario_id UUID NOT NULL,
    compra_id UUID,
    imagem_url TEXT NOT NULL,
    imagem_path TEXT NOT NULL,
    data_criacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    processada BOOLEAN DEFAULT false,
    dados_extraidos JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.notas_imagens ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para notas_imagens
CREATE POLICY "Usuários podem ver suas próprias imagens de notas" 
ON public.notas_imagens 
FOR SELECT 
USING (auth.uid() = usuario_id);

CREATE POLICY "Usuários podem inserir suas próprias imagens de notas" 
ON public.notas_imagens 
FOR INSERT 
WITH CHECK (auth.uid() = usuario_id);

CREATE POLICY "Usuários podem atualizar suas próprias imagens de notas" 
ON public.notas_imagens 
FOR UPDATE 
USING (auth.uid() = usuario_id);

CREATE POLICY "Usuários podem deletar suas próprias imagens de notas" 
ON public.notas_imagens 
FOR DELETE 
USING (auth.uid() = usuario_id);

-- Trigger para atualizar updated_at
CREATE TRIGGER update_notas_imagens_updated_at
BEFORE UPDATE ON public.notas_imagens
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();