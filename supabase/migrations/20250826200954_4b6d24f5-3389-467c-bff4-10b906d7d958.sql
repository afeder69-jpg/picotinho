-- Adicionar campos de autenticação social à tabela profiles
ALTER TABLE public.profiles 
ADD COLUMN provider character varying,
ADD COLUMN provider_id character varying,
ADD COLUMN nome character varying,
ADD COLUMN avatar_url text;

-- Tornar o telefone opcional para permitir login social
ALTER TABLE public.profiles 
ALTER COLUMN telefone DROP NOT NULL;