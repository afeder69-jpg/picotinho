-- Inserir preço atual para CEBOLA ROXA KG GRANEL baseado nos dados da nota fiscal
-- Buscar dados do produto no estoque para inserir na tabela precos_atuais

INSERT INTO precos_atuais (
    produto_nome, 
    valor_unitario, 
    estabelecimento_nome, 
    estabelecimento_cnpj,
    data_atualizacao
)
SELECT 
    ea.produto_nome,
    ea.preco_unitario_ultimo,
    COALESCE(
        ni.dados_extraidos->>'estabelecimento',
        ni.dados_extraidos->'supermercado'->>'nome',
        ni.dados_extraidos->'emitente'->>'nome',
        'Estabelecimento'
    ) as estabelecimento_nome,
    COALESCE(
        ni.dados_extraidos->>'cnpj',
        ni.dados_extraidos->'supermercado'->>'cnpj',
        ni.dados_extraidos->'emitente'->>'cnpj',
        '00000000000000'
    ) as estabelecimento_cnpj,
    now() as data_atualizacao
FROM estoque_app ea
LEFT JOIN notas_imagens ni ON ni.usuario_id = ea.user_id 
    AND ni.processada = true 
    AND ni.dados_extraidos IS NOT NULL
    AND ni.dados_extraidos::text ILIKE '%' || ea.produto_nome || '%'
WHERE ea.produto_nome = 'CEBOLA ROXA KG GRANEL'
    AND ea.preco_unitario_ultimo IS NOT NULL 
    AND ea.preco_unitario_ultimo > 0
    AND NOT EXISTS (
        SELECT 1 FROM precos_atuais pa 
        WHERE pa.produto_nome = ea.produto_nome
    )
LIMIT 1;