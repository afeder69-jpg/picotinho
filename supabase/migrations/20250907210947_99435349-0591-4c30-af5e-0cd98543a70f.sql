-- Criar tabela para preços atuais específicos por usuário
CREATE TABLE public.precos_atuais_usuario (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  produto_nome TEXT NOT NULL,
  valor_unitario NUMERIC NOT NULL DEFAULT 0,
  data_atualizacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  origem TEXT NOT NULL DEFAULT 'manual', -- 'manual' para inserção manual, 'nota_fiscal' para notas
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.precos_atuais_usuario ENABLE ROW LEVEL SECURITY;

-- Política para usuários verem apenas seus próprios preços
CREATE POLICY "Usuários podem ver seus próprios preços atuais" 
ON public.precos_atuais_usuario 
FOR SELECT 
USING (auth.uid() = user_id);

-- Política para usuários criarem seus próprios preços
CREATE POLICY "Usuários podem criar seus próprios preços atuais" 
ON public.precos_atuais_usuario 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Política para usuários atualizarem seus próprios preços
CREATE POLICY "Usuários podem atualizar seus próprios preços atuais" 
ON public.precos_atuais_usuario 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Política para usuários deleterem seus próprios preços
CREATE POLICY "Usuários podem deletar seus próprios preços atuais" 
ON public.precos_atuais_usuario 
FOR DELETE 
USING (auth.uid() = user_id);

-- Índices para performance
CREATE INDEX idx_precos_atuais_usuario_user_produto 
ON public.precos_atuais_usuario (user_id, produto_nome);

CREATE INDEX idx_precos_atuais_usuario_user_id 
ON public.precos_atuais_usuario (user_id);

-- Trigger para atualizar updated_at
CREATE TRIGGER update_precos_atuais_usuario_updated_at
BEFORE UPDATE ON public.precos_atuais_usuario
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Função para sincronizar preços de produtos inseridos manualmente
CREATE OR REPLACE FUNCTION public.sincronizar_preco_manual()
RETURNS TRIGGER AS $$
BEGIN
    -- Se o produto foi inserido/atualizado manualmente (não veio de nota fiscal)
    -- e tem um preço válido, criar/atualizar o preço atual do usuário
    IF NEW.preco_unitario_ultimo IS NOT NULL AND NEW.preco_unitario_ultimo > 0 THEN
        -- Verificar se é uma inserção manual (não há notas fiscais com este produto)
        IF NOT EXISTS (
            SELECT 1 FROM notas_imagens ni 
            WHERE ni.dados_extraidos::text LIKE '%' || NEW.produto_nome || '%'
            AND ni.processada = true
            AND ni.usuario_id = NEW.user_id
        ) THEN
            -- Inserir ou atualizar preço atual específico do usuário
            INSERT INTO public.precos_atuais_usuario (
                user_id,
                produto_nome,
                valor_unitario,
                origem
            ) VALUES (
                NEW.user_id,
                NEW.produto_nome,
                NEW.preco_unitario_ultimo,
                'manual'
            )
            ON CONFLICT (user_id, produto_nome) 
            DO UPDATE SET 
                valor_unitario = NEW.preco_unitario_ultimo,
                data_atualizacao = now(),
                updated_at = now();
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Criar constraint unique para evitar duplicatas
ALTER TABLE public.precos_atuais_usuario 
ADD CONSTRAINT unique_user_produto UNIQUE (user_id, produto_nome);

-- Trigger para sincronizar preços quando produto é inserido/atualizado no estoque
CREATE TRIGGER trigger_sincronizar_preco_manual
AFTER INSERT OR UPDATE ON public.estoque_app
FOR EACH ROW
EXECUTE FUNCTION public.sincronizar_preco_manual();