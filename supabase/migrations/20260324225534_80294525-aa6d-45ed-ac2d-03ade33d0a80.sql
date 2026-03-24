-- Adicionar novos padrões de regex para CARTELA/BANDEJA/NN UN
INSERT INTO regras_conversao_embalagem
  (produto_pattern, produto_exclusao_pattern, tipo_embalagem, qtd_por_embalagem, unidade_consumo, prioridade)
VALUES
  ('\b(OVO|OVOS)\b.*\bCARTELA\b.*\b30\b', '\b(MASSA|MACARRAO|PASCOA|CHOCOLATE)\b', 'CARTELA', 30, 'UN', 10),
  ('\b(OVO|OVOS)\b.*\bCARTELA\b.*\b20\b', '\b(MASSA|MACARRAO|PASCOA|CHOCOLATE)\b', 'CARTELA', 20, 'UN', 10),
  ('\b(OVO|OVOS)\b.*\bCARTELA\b.*\b12\b', '\b(MASSA|MACARRAO|PASCOA|CHOCOLATE)\b', 'CARTELA', 12, 'UN', 10),
  ('\b(OVO|OVOS)\b.*\bBANDEJA\b.*\b30\b', '\b(MASSA|MACARRAO|PASCOA|CHOCOLATE)\b', 'BANDEJA', 30, 'UN', 10),
  ('\b(OVO|OVOS)\b.*\bBANDEJA\b.*\b20\b', '\b(MASSA|MACARRAO|PASCOA|CHOCOLATE)\b', 'BANDEJA', 20, 'UN', 10),
  ('\b(OVO|OVOS)\b.*\bBANDEJA\b.*\b12\b', '\b(MASSA|MACARRAO|PASCOA|CHOCOLATE)\b', 'BANDEJA', 12, 'UN', 10),
  ('\b(OVO|OVOS)\b.*\b30\s*UN', '\b(MASSA|MACARRAO|PASCOA|CHOCOLATE)\b', 'CARTELA', 30, 'UN', 25),
  ('\b(OVO|OVOS)\b.*\b20\s*UN', '\b(MASSA|MACARRAO|PASCOA|CHOCOLATE)\b', 'CARTELA', 20, 'UN', 25),
  ('\b(OVO|OVOS)\b.*\b12\s*UN', '\b(MASSA|MACARRAO|PASCOA|CHOCOLATE)\b', 'CARTELA', 12, 'UN', 25),
  ('\b(OVO|OVOS)\b.*\b6\s*UN', '\b(MASSA|MACARRAO|PASCOA|CHOCOLATE)\b', 'CARTELA', 6, 'UN', 25);

-- Corrigir os 2 registros históricos com dados errados
-- Megabox: qty=30 está OK, mas preço deve ser 18.6/30 = 0.62
UPDATE estoque_app SET 
  preco_unitario_ultimo = 0.62,
  preco_por_unidade_base = 0.62
WHERE id = 'fc018097-0422-4746-896f-a57688eefbb6';

-- Assaí: qty deve ser 60 (3×20), preço deve ser 43.95/60 = 0.7325
UPDATE estoque_app SET 
  quantidade = 60, 
  preco_unitario_ultimo = 0.7325,
  preco_por_unidade_base = 0.7325,
  qtd_valor = 3,
  qtd_base = 20
WHERE id = '7dbeddc1-59d5-4081-b624-09e2c9bd9233';