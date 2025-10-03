-- =====================================================
-- FASE 1A: ADICIONAR ENUM E COLUNAS DE AUDITORIA
-- =====================================================

-- 1. ADICIONAR 'admin' AO ENUM app_role
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'admin';

-- 2. ADICIONAR COLUNAS DE AUDITORIA NA user_roles
ALTER TABLE user_roles 
ADD COLUMN IF NOT EXISTS revogado_em TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS revogado_por UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS motivo_revogacao TEXT,
ADD COLUMN IF NOT EXISTS reativado_em TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS reativado_por UUID REFERENCES auth.users(id);

-- Criar índice para consultas de roles ativas
CREATE INDEX IF NOT EXISTS idx_user_roles_ativas 
ON user_roles(user_id, role) 
WHERE revogado_em IS NULL;