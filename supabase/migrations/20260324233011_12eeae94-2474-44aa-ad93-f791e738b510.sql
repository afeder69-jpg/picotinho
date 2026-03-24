-- Sanitizar precos_atuais de ovos: converter preços de embalagem para unidade base

-- 1) Cartela/Caixa de 30
UPDATE precos_atuais
SET preco_por_unidade_base = valor_unitario / 30.0,
    qtd_base = 30,
    tipo_embalagem = 'CARTELA'
WHERE UPPER(produto_nome) ~ '\m(OVO|OVOS)\M'
  AND (UPPER(produto_nome) ~ '\mC/30\M' OR UPPER(produto_nome) ~ '30\s*UN' OR UPPER(produto_nome) ~ 'CARTELA.*30')
  AND UPPER(produto_nome) !~ '\m(MASSA|MACARRAO|PASCOA|CHOCOLATE)\M'
  AND (preco_por_unidade_base IS NULL OR preco_por_unidade_base = 0)
  AND valor_unitario > 5;

-- 2) Bandeja/Caixa de 20
UPDATE precos_atuais
SET preco_por_unidade_base = valor_unitario / 20.0,
    qtd_base = 20,
    tipo_embalagem = 'BANDEJA'
WHERE UPPER(produto_nome) ~ '\m(OVO|OVOS)\M'
  AND (UPPER(produto_nome) ~ '\mC/20\M' OR UPPER(produto_nome) ~ '20\s*UN' OR UPPER(produto_nome) ~ 'BANDEJA.*20')
  AND UPPER(produto_nome) !~ '\m(MASSA|MACARRAO|PASCOA|CHOCOLATE)\M'
  AND (preco_por_unidade_base IS NULL OR preco_por_unidade_base = 0)
  AND valor_unitario > 3;

-- 3) Caixa de 12 / Dúzia
UPDATE precos_atuais
SET preco_por_unidade_base = valor_unitario / 12.0,
    qtd_base = 12,
    tipo_embalagem = 'CARTELA'
WHERE UPPER(produto_nome) ~ '\m(OVO|OVOS)\M'
  AND (UPPER(produto_nome) ~ '\mC/12\M' OR UPPER(produto_nome) ~ '12\s*UN' OR UPPER(produto_nome) ~ 'DUZIA')
  AND UPPER(produto_nome) !~ '\m(MASSA|MACARRAO|PASCOA|CHOCOLATE|MEIA)\M'
  AND (preco_por_unidade_base IS NULL OR preco_por_unidade_base = 0)
  AND valor_unitario > 2;

-- 4) Meia dúzia / 6 unidades
UPDATE precos_atuais
SET preco_por_unidade_base = valor_unitario / 6.0,
    qtd_base = 6,
    tipo_embalagem = 'CARTELA'
WHERE UPPER(produto_nome) ~ '\m(OVO|OVOS)\M'
  AND (UPPER(produto_nome) ~ '\mC/6\M' OR UPPER(produto_nome) ~ '6\s*UN' OR UPPER(produto_nome) ~ 'MEIA\s*DUZIA')
  AND UPPER(produto_nome) !~ '\m(MASSA|MACARRAO|PASCOA|CHOCOLATE)\M'
  AND (preco_por_unidade_base IS NULL OR preco_por_unidade_base = 0)
  AND valor_unitario > 1;