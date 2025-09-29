-- Alterar o campo data_consumo para sempre usar o timestamp atual
ALTER TABLE public.consumos_app 
ALTER COLUMN data_consumo SET DEFAULT now();

-- Criar função para forçar data_consumo para now() sempre
CREATE OR REPLACE FUNCTION public.force_current_timestamp_consumos()
RETURNS TRIGGER AS $$
BEGIN
    -- Sempre definir data_consumo como now(), ignorando qualquer valor enviado
    NEW.data_consumo = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Criar trigger para INSERT que sempre define data_consumo como now()
CREATE TRIGGER force_consumo_timestamp_insert
    BEFORE INSERT ON public.consumos_app
    FOR EACH ROW
    EXECUTE FUNCTION public.force_current_timestamp_consumos();

-- Criar trigger para UPDATE que sempre define data_consumo como now()
CREATE TRIGGER force_consumo_timestamp_update
    BEFORE UPDATE ON public.consumos_app
    FOR EACH ROW
    EXECUTE FUNCTION public.force_current_timestamp_consumos();