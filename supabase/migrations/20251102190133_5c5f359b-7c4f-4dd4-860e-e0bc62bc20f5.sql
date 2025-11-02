-- Adicionar coluna pdf_url para armazenar temporariamente o PDF gerado do cupom InfoSimples
ALTER TABLE notas_imagens 
ADD COLUMN IF NOT EXISTS pdf_url TEXT DEFAULT NULL;

-- Comentário explicativo
COMMENT ON COLUMN notas_imagens.pdf_url IS 'URL temporária do PDF gerado a partir do HTML do InfoSimples. Será deletado após processamento bem-sucedido.';