-- Criar trigger para reverter estoque automaticamente quando nota for excluída
CREATE OR REPLACE TRIGGER trigger_reverter_estoque_nota_excluida
    BEFORE DELETE ON public.notas_imagens
    FOR EACH ROW 
    EXECUTE FUNCTION public.reverter_estoque_nota_excluida();