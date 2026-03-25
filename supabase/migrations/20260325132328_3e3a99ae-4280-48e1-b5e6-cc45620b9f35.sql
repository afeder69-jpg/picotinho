ALTER TABLE public.whatsapp_preferencias_usuario
ADD COLUMN IF NOT EXISTS lista_ativa_id UUID REFERENCES public.listas_compras(id) ON DELETE SET NULL;