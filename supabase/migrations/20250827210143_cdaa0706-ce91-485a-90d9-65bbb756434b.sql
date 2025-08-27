-- Consolidar produtos duplicados no estoque atual
-- Primeiro, consolidar MARACUJA duplicados
UPDATE estoque_app 
SET quantidade = 3.18, produto_nome = 'MARACUJA AZEDO KG'
WHERE produto_nome = 'MARACUJ AZEDO KG';

DELETE FROM estoque_app 
WHERE produto_nome = 'MARACUJA KG AZEDO';

-- Verificar se há outras duplicações e consolidar
-- Normalizar nomes de produtos existentes para evitar duplicações futuras
UPDATE estoque_app 
SET produto_nome = UPPER(TRIM(
  REGEXP_REPLACE(
    REGEXP_REPLACE(
      REGEXP_REPLACE(
        REGEXP_REPLACE(
          REGEXP_REPLACE(
            REGEXP_REPLACE(produto_nome, '\b(MARACUJ[AÁ]?)\b', 'MARACUJA', 'gi'),
            '\b(LIM[AÃ]O)\b', 'LIMAO', 'gi'
          ),
          '\b(MAM[AÃ]O)\b', 'MAMAO', 'gi'
        ),
        '\b(MU[CÇ]ARELA)\b', 'MUCARELA', 'gi'
      ),
      '\b(KG\s+AZEDO|AZEDO\s+KG)\b', 'AZEDO KG', 'gi'
    ),
    '\s+', ' ', 'g'
  )
));