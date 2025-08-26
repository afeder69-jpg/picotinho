-- Criar bucket para armazenar screenshots das notas fiscais
INSERT INTO storage.buckets (id, name, public) 
VALUES ('receipts', 'receipts', true);

-- Criar tabela para armazenar notas fiscais processadas
CREATE TABLE public.receipts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users,
  qr_url TEXT NOT NULL,
  screenshot_url TEXT,
  screenshot_path TEXT,
  store_name TEXT,
  store_cnpj TEXT,
  purchase_date DATE,
  total_amount NUMERIC(10,2),
  raw_data JSONB,
  processed_data JSONB,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Criar tabela para itens das notas fiscais
CREATE TABLE public.receipt_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  receipt_id UUID NOT NULL REFERENCES public.receipts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  quantity NUMERIC(10,3),
  unit_price NUMERIC(10,2),
  total_price NUMERIC(10,2),
  unit TEXT,
  description TEXT,
  line_number INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar RLS nas tabelas
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipt_items ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para receipts
CREATE POLICY "Users can view their own receipts" 
ON public.receipts 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own receipts" 
ON public.receipts 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own receipts" 
ON public.receipts 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own receipts" 
ON public.receipts 
FOR DELETE 
USING (auth.uid() = user_id);

-- Políticas RLS para receipt_items
CREATE POLICY "Users can view receipt items for their receipts" 
ON public.receipt_items 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.receipts 
    WHERE receipts.id = receipt_items.receipt_id 
    AND receipts.user_id = auth.uid()
  )
);

CREATE POLICY "Users can create receipt items for their receipts" 
ON public.receipt_items 
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.receipts 
    WHERE receipts.id = receipt_items.receipt_id 
    AND receipts.user_id = auth.uid()
  )
);

CREATE POLICY "Users can update receipt items for their receipts" 
ON public.receipt_items 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM public.receipts 
    WHERE receipts.id = receipt_items.receipt_id 
    AND receipts.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete receipt items for their receipts" 
ON public.receipt_items 
FOR DELETE 
USING (
  EXISTS (
    SELECT 1 FROM public.receipts 
    WHERE receipts.id = receipt_items.receipt_id 
    AND receipts.user_id = auth.uid()
  )
);

-- Políticas de storage para o bucket receipts
CREATE POLICY "Users can view receipt screenshots" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'receipts');

CREATE POLICY "Users can upload receipt screenshots" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'receipts');

CREATE POLICY "Users can update receipt screenshots" 
ON storage.objects 
FOR UPDATE 
USING (bucket_id = 'receipts');

CREATE POLICY "Users can delete receipt screenshots" 
ON storage.objects 
FOR DELETE 
USING (bucket_id = 'receipts');

-- Trigger para updated_at
CREATE TRIGGER update_receipts_updated_at
  BEFORE UPDATE ON public.receipts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Índices para performance
CREATE INDEX idx_receipts_user_id ON public.receipts(user_id);
CREATE INDEX idx_receipts_created_at ON public.receipts(created_at);
CREATE INDEX idx_receipt_items_receipt_id ON public.receipt_items(receipt_id);