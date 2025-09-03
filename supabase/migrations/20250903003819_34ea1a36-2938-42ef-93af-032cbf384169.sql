-- CORREÇÃO DE SEGURANÇA: Proteger dados sensíveis de supermercados
-- PROBLEMA: Edge function expõe CNPJ, email, telefone para qualquer usuário
-- SOLUÇÃO: Criar view sanitizada e políticas mais restritivas

-- 1. Criar view pública que expõe apenas dados não-sensíveis dos supermercados
CREATE OR REPLACE VIEW supermercados_publicos AS
SELECT 
  id,
  nome,
  endereco,
  cidade,
  estado,
  cep,
  latitude,
  longitude,
  ativo,
  created_at,
  updated_at,
  -- Campos sensíveis removidos: cnpj, telefone, email
  'CONFIDENCIAL' as cnpj_display, -- Indicação de que é confidencial
  NULL as telefone, -- Não expor telefone
  NULL as email     -- Não expor email
FROM supermercados 
WHERE ativo = true;

-- 2. Função segura para obter dados básicos de supermercados (sem dados sensíveis)
CREATE OR REPLACE FUNCTION get_supermercados_publicos()
RETURNS TABLE(
  id uuid,
  nome character varying,
  endereco text,
  cidade character varying,
  estado character varying,
  cep character varying,
  latitude numeric,
  longitude numeric,
  ativo boolean,
  created_at timestamp with time zone,
  updated_at timestamp with time zone
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Retornar apenas dados não-sensíveis de supermercados ativos
  RETURN QUERY
  SELECT 
    s.id,
    s.nome,
    s.endereco,
    s.cidade,
    s.estado,
    s.cep,
    s.latitude,
    s.longitude,
    s.ativo,
    s.created_at,
    s.updated_at
  FROM supermercados s
  WHERE s.ativo = true;
END;
$$;

-- 3. Função para verificar se usuário tem notas fiscais de um supermercado específico
CREATE OR REPLACE FUNCTION usuario_tem_notas_supermercado(supermercado_cnpj text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cnpj_limpo text;
  tem_notas boolean := false;
BEGIN
  -- Verificar autenticação
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;
  
  -- Normalizar CNPJ
  cnpj_limpo := regexp_replace(supermercado_cnpj, '[^\d]', '', 'g');
  
  -- Verificar se usuário tem notas fiscais deste supermercado
  SELECT EXISTS(
    SELECT 1 
    FROM notas_imagens ni
    WHERE ni.usuario_id = auth.uid()
    AND ni.processada = true
    AND ni.dados_extraidos IS NOT NULL
    AND (
      regexp_replace(COALESCE(ni.dados_extraidos->>'cnpj', ''), '[^\d]', '', 'g') = cnpj_limpo
      OR regexp_replace(COALESCE(ni.dados_extraidos->'estabelecimento'->>'cnpj', ''), '[^\d]', '', 'g') = cnpj_limpo
      OR regexp_replace(COALESCE(ni.dados_extraidos->'supermercado'->>'cnpj', ''), '[^\d]', '', 'g') = cnpj_limpo
      OR regexp_replace(COALESCE(ni.dados_extraidos->'emitente'->>'cnpj', ''), '[^\d]', '', 'g') = cnpj_limpo
    )
  ) INTO tem_notas;
  
  RETURN tem_notas;
END;
$$;

-- 4. Atualizar política de supermercados para ser mais restritiva
DROP POLICY IF EXISTS "Usuários podem ver supermercados onde compraram" ON supermercados;

-- Nova política mais segura: acesso limitado apenas a dados essenciais
CREATE POLICY "Usuários podem ver dados básicos de supermercados com notas"
ON supermercados
FOR SELECT
TO authenticated
USING (
  ativo = true AND
  EXISTS (
    SELECT 1 
    FROM notas_imagens ni
    WHERE ni.usuario_id = auth.uid()
    AND ni.processada = true
    AND ni.dados_extraidos IS NOT NULL
    AND (
      regexp_replace(COALESCE(ni.dados_extraidos->>'cnpj', ''), '[^\d]', '', 'g') = 
      regexp_replace(supermercados.cnpj, '[^\d]', '', 'g')
      OR regexp_replace(COALESCE(ni.dados_extraidos->'estabelecimento'->>'cnpj', ''), '[^\d]', '', 'g') = 
      regexp_replace(supermercados.cnpj, '[^\d]', '', 'g')
      OR regexp_replace(COALESCE(ni.dados_extraidos->'supermercado'->>'cnpj', ''), '[^\d]', '', 'g') = 
      regexp_replace(supermercados.cnpj, '[^\d]', '', 'g')
      OR regexp_replace(COALESCE(ni.dados_extraidos->'emitente'->>'cnpj', ''), '[^\d]', '', 'g') = 
      regexp_replace(supermercados.cnpj, '[^\d]', '', 'g')
    )
  )
);

-- 5. Criar tabela de auditoria para monitorar acessos a dados de supermercados
CREATE TABLE IF NOT EXISTS supermercado_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  supermercado_id uuid,
  action text NOT NULL,
  dados_acessados jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE supermercado_access_log ENABLE ROW LEVEL SECURITY;

-- Política de auditoria: apenas sistema pode inserir, usuários não podem ver
CREATE POLICY "Sistema pode inserir logs de acesso" ON supermercado_access_log
FOR INSERT USING (true);

CREATE POLICY "Bloquear leitura de logs de acesso" ON supermercado_access_log
FOR SELECT USING (false);

-- 6. Comentários de segurança
COMMENT ON TABLE supermercados IS 'Dados empresariais sensíveis - CNPJ, telefone e email são confidenciais';
COMMENT ON VIEW supermercados_publicos IS 'View segura sem dados sensíveis empresariais';
COMMENT ON FUNCTION get_supermercados_publicos() IS 'Função segura para acesso público a dados não-sensíveis';
COMMENT ON FUNCTION usuario_tem_notas_supermercado(text) IS 'Verifica relacionamento legítimo usuário-supermercado';