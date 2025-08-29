-- Criar trigger para reverter estoque automaticamente quando uma nota for excluída
CREATE OR REPLACE TRIGGER trigger_reverter_estoque_nota_excluida
    BEFORE DELETE ON notas_imagens
    FOR EACH ROW
    EXECUTE FUNCTION reverter_estoque_nota_excluida();