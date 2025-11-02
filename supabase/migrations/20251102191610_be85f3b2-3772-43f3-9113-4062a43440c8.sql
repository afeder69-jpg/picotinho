-- Adicionar coluna pdf_gerado para controlar geração de PDF do InfoSimples
ALTER TABLE notas_imagens 
ADD COLUMN IF NOT EXISTS pdf_gerado BOOLEAN DEFAULT FALSE;

-- Comentário explicativo
COMMENT ON COLUMN notas_imagens.pdf_gerado IS 'Indica se o PDF temporário já foi gerado a partir do HTML do InfoSimples. Usado para evitar regerar PDFs.';