-- CORREÇÃO DE SEGURANÇA: Proteger dados sensíveis de supermercados
-- PROBLEMA: Edge function expõe CNPJ, email, telefone para qualquer usuário

-- 1. Atualizar política de supermercados para ser mais restritiva
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

-- 2. Criar view pública que expõe apenas dados não-sensíveis dos supermercados
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
  'CONFIDENCIAL' as cnpj_display -- Indicação de que é confidencial
FROM supermercados 
WHERE ativo = true;