-- Criar enum para roles de usuário
CREATE TYPE public.app_role AS ENUM ('master', 'user');

-- Criar tabela de roles de usuário
CREATE TABLE public.user_roles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    UNIQUE (user_id, role)
);

-- Habilitar RLS na tabela user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Função para verificar se usuário tem uma role específica
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Função para verificar se o usuário atual é master
CREATE OR REPLACE FUNCTION public.is_master()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'master'::app_role)
$$;

-- Policy para user_roles - apenas masters podem gerenciar roles
CREATE POLICY "Masters can manage all user roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'master'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'master'::app_role));

-- Policy para permitir usuários verem suas próprias roles
CREATE POLICY "Users can view their own roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Atualizar policies da tabela propostas_revisao para masters verem todas
DROP POLICY IF EXISTS "Usuários podem ver propostas" ON public.propostas_revisao;
DROP POLICY IF EXISTS "Usuários podem atualizar propostas" ON public.propostas_revisao;

CREATE POLICY "Masters can view all proposals"
ON public.propostas_revisao
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'master'::app_role));

CREATE POLICY "Masters can update all proposals"
ON public.propostas_revisao
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'master'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'master'::app_role));

-- Inserir role de master para o usuário atual (substitua pelo seu user_id real)
-- Você precisará executar isso manualmente com seu user_id correto:
-- INSERT INTO public.user_roles (user_id, role) 
-- VALUES ('seu-user-id-aqui', 'master'::app_role)
-- ON CONFLICT (user_id, role) DO NOTHING;