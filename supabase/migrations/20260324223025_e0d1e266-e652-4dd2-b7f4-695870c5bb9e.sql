CREATE TABLE regras_conversao_embalagem (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_pattern text NOT NULL,
  produto_exclusao_pattern text,
  ean_pattern text,
  tipo_embalagem text NOT NULL,
  qtd_por_embalagem integer NOT NULL,
  unidade_consumo text NOT NULL DEFAULT 'UN',
  tipo_conversao text NOT NULL DEFAULT 'fixa',
  prioridade integer NOT NULL DEFAULT 100,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE regras_conversao_embalagem ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role pode ler regras"
  ON regras_conversao_embalagem FOR SELECT
  TO service_role
  USING (true);

INSERT INTO regras_conversao_embalagem
  (produto_pattern, produto_exclusao_pattern, tipo_embalagem, qtd_por_embalagem, unidade_consumo, prioridade)
VALUES
  ('\b(OVO|OVOS)\b.*\bC\/30\b', '\b(MASSA|MACARRAO|PASCOA|CHOCOLATE)\b', 'CARTELA', 30, 'UN', 10),
  ('\b(OVO|OVOS)\b.*\bC\/20\b', '\b(MASSA|MACARRAO|PASCOA|CHOCOLATE)\b', 'CARTELA', 20, 'UN', 10),
  ('\b(OVO|OVOS)\b.*\bC\/12\b', '\b(MASSA|MACARRAO|PASCOA|CHOCOLATE)\b', 'CARTELA', 12, 'UN', 10),
  ('\b(OVO|OVOS)\b.*\bC\/6\b',  '\b(MASSA|MACARRAO|PASCOA|CHOCOLATE)\b', 'CARTELA', 6, 'UN', 10),
  ('\b(OVO|OVOS)\b.*\bDUZIA\b', '\b(MASSA|MACARRAO|PASCOA|CHOCOLATE)\b', 'DUZIA', 12, 'UN', 20),
  ('\bMEIA\s*DUZIA\b.*\b(OVO|OVOS)\b', '\b(MASSA|MACARRAO|PASCOA|CHOCOLATE)\b', 'MEIA_DUZIA', 6, 'UN', 15);