-- Criar tabela de perfis de usuário para dados adicionais
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    telefone VARCHAR(15) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para perfis
CREATE POLICY "Usuários podem ver seu próprio perfil" 
ON public.profiles FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Usuários podem inserir seu próprio perfil" 
ON public.profiles FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuários podem atualizar seu próprio perfil" 
ON public.profiles FOR UPDATE 
USING (auth.uid() = user_id);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON public.profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_telefone ON public.profiles(telefone);

-- Trigger para updated_at
CREATE TRIGGER update_profiles_updated_at 
BEFORE UPDATE ON public.profiles 
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Função para criar perfil automaticamente após signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- O perfil será criado pela aplicação, não automaticamente
    -- Retorna o novo usuário
    RETURN NEW;
END;
$$;

-- Comentários
COMMENT ON TABLE public.profiles IS 'Perfis de usuário com informações adicionais';
COMMENT ON COLUMN public.profiles.telefone IS 'Número de telefone único do usuário';