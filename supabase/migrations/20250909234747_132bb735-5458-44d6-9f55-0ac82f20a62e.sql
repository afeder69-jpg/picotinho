-- Remover todos os produtos "manual" que aparecem nas notas fiscais
-- usando uma abordagem mais simples de comparação

DELETE FROM precos_atuais_usuario pau
WHERE pau.origem = 'manual'
AND EXISTS (
    SELECT 1 FROM notas_imagens ni
    WHERE ni.usuario_id = pau.user_id
    AND ni.processada = true
    AND ni.dados_extraidos IS NOT NULL
    AND ni.dados_extraidos::text LIKE '%' || pau.produto_nome || '%'
);

-- Verificar e remover especificamente os produtos que sabemos que existem nas notas
DELETE FROM precos_atuais_usuario 
WHERE origem = 'manual' 
AND produto_nome IN (
    'MILHO VERDE PREDILECTA LATA',
    'ESPONJA DE AÇO BOMBRIL PACOTINHO C/6', 
    'MASSA C/OVOS ORQUIDEA ARGOLA',
    'QUEIJO PARMESÃO PRESIDENT RALADO',
    'LIMPEZA PERFUME CASA E PERFUME SENSUALIDADE',
    'DETERGENTE LIMPOL CRISTAL',
    'AVEIA EM GRÃOS QUAKER FINOS',
    'REQUEIJÃO CREMOSO TIROLEZ TRADICIONAL',
    'AZEITE EXTRA VIRGEM ANDORINHA VD',
    'SABÃO EM PÓ SURF EXPLO. DE FLORES',
    'SUCO CONCENTRADO IMBIARA CAJU',
    'CHÁ PRONTO MATTE LEÃO 1. NATURAL'
);