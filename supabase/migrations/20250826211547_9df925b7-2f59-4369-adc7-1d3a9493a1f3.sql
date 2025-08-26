-- Habilitar RLS nas tabelas que estão sem
ALTER TABLE public.receipt_items_public ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipts_public ENABLE ROW LEVEL SECURITY;  
ALTER TABLE public.ingestion_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categorias_predefinidas ENABLE ROW LEVEL SECURITY;

-- Criar políticas básicas para tabelas públicas (somente leitura)
CREATE POLICY "Allow public read access" ON public.receipt_items_public FOR SELECT USING (true);
CREATE POLICY "Allow public read access" ON public.receipts_public FOR SELECT USING (true);
CREATE POLICY "Allow system access" ON public.ingestion_jobs FOR ALL USING (true);
CREATE POLICY "Allow public read access" ON public.categorias_predefinidas FOR SELECT USING (true);