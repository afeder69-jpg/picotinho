-- Correção das questões de segurança identificadas pelo linter

-- 1. Habilitar RLS nas tabelas que estão faltando
ALTER TABLE public.mercados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notas_fiscais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- 2. Criar políticas básicas para as tabelas que não têm
-- Mercados
CREATE POLICY "Usuários podem visualizar seus mercados" ON public.mercados FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Usuários podem criar seus mercados" ON public.mercados FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Usuários podem atualizar seus mercados" ON public.mercados FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Usuários podem deletar seus mercados" ON public.mercados FOR DELETE USING (auth.uid() = user_id);

-- Notas fiscais
CREATE POLICY "Usuários podem visualizar suas notas fiscais" ON public.notas_fiscais FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Usuários podem criar suas notas fiscais" ON public.notas_fiscais FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Usuários podem atualizar suas notas fiscais" ON public.notas_fiscais FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Usuários podem deletar suas notas fiscais" ON public.notas_fiscais FOR DELETE USING (auth.uid() = user_id);

-- Users (apenas para visualização própria)
CREATE POLICY "Usuários podem ver seu próprio perfil" ON public.users FOR SELECT USING (auth.uid()::text = id::text);
CREATE POLICY "Usuários podem atualizar seu próprio perfil" ON public.users FOR UPDATE USING (auth.uid()::text = id::text);

-- 3. Corrigir funções com search_path mutable
CREATE OR REPLACE FUNCTION public.calculate_item_total_app()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    NEW.preco_total = (NEW.quantidade * NEW.preco_unitario) - COALESCE(NEW.desconto_item, 0);
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_compra_total_app()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.compras_app 
    SET preco_total = (
        SELECT COALESCE(SUM(preco_total), 0) 
        FROM public.itens_compra_app 
        WHERE compra_id = COALESCE(NEW.compra_id, OLD.compra_id)
    )
    WHERE id = COALESCE(NEW.compra_id, OLD.compra_id);
    
    RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.insert_historico_precos_app()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.historico_precos_app (produto_id, supermercado_id, preco, data_preco)
    SELECT 
        NEW.produto_id,
        c.supermercado_id,
        NEW.preco_unitario,
        c.data_compra
    FROM public.compras_app c
    WHERE c.id = NEW.compra_id;
    
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- 4. Recriar as views sem SECURITY DEFINER (elas vão usar as permissões do usuário)
DROP VIEW IF EXISTS public.view_preco_medio_produto_app;
CREATE VIEW public.view_preco_medio_produto_app AS
SELECT 
    p.id as produto_id,
    p.nome as produto_nome,
    c.nome as categoria_nome,
    AVG(ic.preco_unitario) as preco_medio,
    COUNT(ic.id) as total_compras,
    MIN(ic.preco_unitario) as menor_preco,
    MAX(ic.preco_unitario) as maior_preco
FROM public.produtos_app p
JOIN public.categorias c ON p.categoria_id = c.id
JOIN public.itens_compra_app ic ON p.id = ic.produto_id
GROUP BY p.id, p.nome, c.nome;

DROP VIEW IF EXISTS public.view_gastos_categoria_app;
CREATE VIEW public.view_gastos_categoria_app AS
SELECT 
    cat.id as categoria_id,
    cat.nome as categoria_nome,
    SUM(ic.preco_total) as total_gasto,
    AVG(ic.preco_total) as gasto_medio,
    COUNT(ic.id) as total_itens
FROM public.categorias cat
JOIN public.produtos_app p ON cat.id = p.categoria_id
JOIN public.itens_compra_app ic ON p.id = ic.produto_id
JOIN public.compras_app comp ON ic.compra_id = comp.id
GROUP BY cat.id, cat.nome;

DROP VIEW IF EXISTS public.view_comparacao_supermercados_app;
CREATE VIEW public.view_comparacao_supermercados_app AS
SELECT 
    p.id as produto_id,
    p.nome as produto_nome,
    s.id as supermercado_id,
    s.nome as supermercado_nome,
    AVG(ic.preco_unitario) as preco_medio,
    COUNT(ic.id) as vezes_comprado,
    MAX(comp.data_compra) as ultima_compra
FROM public.produtos_app p
JOIN public.itens_compra_app ic ON p.id = ic.produto_id
JOIN public.compras_app comp ON ic.compra_id = comp.id
JOIN public.supermercados s ON comp.supermercado_id = s.id
GROUP BY p.id, p.nome, s.id, s.nome;