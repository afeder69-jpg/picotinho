-- Aplicar normalização mais inteligente baseada no mapa detalhado
UPDATE estoque_app 
SET categoria = CASE 
    -- HORTIFRUTI
    WHEN UPPER(produto_nome) LIKE '%BANANA%' OR UPPER(produto_nome) LIKE '%MAÇÃ%' OR UPPER(produto_nome) LIKE '%MACA%' 
         OR UPPER(produto_nome) LIKE '%ALFACE%' OR UPPER(produto_nome) LIKE '%TOMATE%' 
         OR UPPER(produto_nome) LIKE '%CEBOLA%' OR UPPER(produto_nome) LIKE '%BATATA%' 
         OR UPPER(produto_nome) LIKE '%LIMÃO%' OR UPPER(produto_nome) LIKE '%LIMAO%'
         OR UPPER(produto_nome) LIKE '%FRUTA%' OR UPPER(produto_nome) LIKE '%VERDURA%'
         OR UPPER(produto_nome) LIKE '%LEGUME%' OR UPPER(produto_nome) LIKE '%CENOURA%'
         OR UPPER(produto_nome) LIKE '%ABOBRINHA%' OR UPPER(produto_nome) LIKE '%BETERRABA%'
         OR UPPER(produto_nome) LIKE '%MAMÃO%' OR UPPER(produto_nome) LIKE '%MAMAO%'
         OR UPPER(produto_nome) LIKE '%ABACAXI%' OR UPPER(produto_nome) LIKE '%RÚCULA%'
         OR UPPER(produto_nome) LIKE '%RUCULA%' OR categoria = 'hortifruti'
    THEN 'hortifruti'
    
    -- BEBIDAS
    WHEN UPPER(produto_nome) LIKE '%REFRIGERANTE%' OR UPPER(produto_nome) LIKE '%COCA%'
         OR UPPER(produto_nome) LIKE '%PEPSI%' OR UPPER(produto_nome) LIKE '%SUCO%'
         OR UPPER(produto_nome) LIKE '%ÁGUA%' OR UPPER(produto_nome) LIKE '%AGUA%'
         OR UPPER(produto_nome) LIKE '%CERVEJA%' OR UPPER(produto_nome) LIKE '%VINHO%'
         OR UPPER(produto_nome) LIKE '%CACHAÇA%' OR UPPER(produto_nome) LIKE '%CACHACA%'
         OR UPPER(produto_nome) LIKE '%WHISKY%' OR UPPER(produto_nome) LIKE '%VODKA%'
         OR UPPER(produto_nome) LIKE '%ENERGÉTICO%' OR UPPER(produto_nome) LIKE '%ENERGETICO%'
         OR categoria = 'bebidas'
    THEN 'bebidas'
    
    -- MERCEARIA
    WHEN UPPER(produto_nome) LIKE '%ARROZ%' OR UPPER(produto_nome) LIKE '%FEIJÃO%'
         OR UPPER(produto_nome) LIKE '%FEIJAO%' OR UPPER(produto_nome) LIKE '%MACARRÃO%'
         OR UPPER(produto_nome) LIKE '%MACARRAO%' OR UPPER(produto_nome) LIKE '%AÇÚCAR%'
         OR UPPER(produto_nome) LIKE '%ACUCAR%' OR UPPER(produto_nome) LIKE '%SAL%'
         OR UPPER(produto_nome) LIKE '%ÓLEO%' OR UPPER(produto_nome) LIKE '%OLEO%'
         OR UPPER(produto_nome) LIKE '%CAFÉ%' OR UPPER(produto_nome) LIKE '%CAFE%'
         OR UPPER(produto_nome) LIKE '%FARINHA%' OR UPPER(produto_nome) LIKE '%MOLHO%'
         OR UPPER(produto_nome) LIKE '%EXTRATO%' OR UPPER(produto_nome) LIKE '%VINAGRE%'
         OR UPPER(produto_nome) LIKE '%TEMPERO%' OR UPPER(produto_nome) LIKE '%CONDIMENTO%'
         OR categoria = 'mercearia'
    THEN 'mercearia'
    
    -- AÇOUGUE
    WHEN UPPER(produto_nome) LIKE '%CARNE%' OR UPPER(produto_nome) LIKE '%FRANGO%'
         OR UPPER(produto_nome) LIKE '%PEIXE%' OR UPPER(produto_nome) LIKE '%LINGUIÇA%'
         OR UPPER(produto_nome) LIKE '%LINGUICA%' OR UPPER(produto_nome) LIKE '%SALSICHA%'
         OR UPPER(produto_nome) LIKE '%PICANHA%' OR UPPER(produto_nome) LIKE '%BOVINA%'
         OR UPPER(produto_nome) LIKE '%SUÍNA%' OR UPPER(produto_nome) LIKE '%SUINA%'
         OR categoria IN ('açougue', 'carnes', 'carne')
    THEN 'açougue'
    
    -- PADARIA
    WHEN UPPER(produto_nome) LIKE '%PÃO%' OR UPPER(produto_nome) LIKE '%PAO%'
         OR UPPER(produto_nome) LIKE '%BOLO%' OR UPPER(produto_nome) LIKE '%BISCOITO%'
         OR UPPER(produto_nome) LIKE '%TORRADA%' OR UPPER(produto_nome) LIKE '%ROSQUINHA%'
         OR UPPER(produto_nome) LIKE '%CROISSANT%' OR UPPER(produto_nome) LIKE '%SALGADO%'
         OR categoria = 'padaria'
    THEN 'padaria'
    
    -- LATICÍNIOS/FRIOS
    WHEN UPPER(produto_nome) LIKE '%LEITE%' OR UPPER(produto_nome) LIKE '%QUEIJO%'
         OR UPPER(produto_nome) LIKE '%MANTEIGA%' OR UPPER(produto_nome) LIKE '%MARGARINA%'
         OR UPPER(produto_nome) LIKE '%IOGURTE%' OR UPPER(produto_nome) LIKE '%REQUEIJÃO%'
         OR UPPER(produto_nome) LIKE '%REQUEIJAO%' OR UPPER(produto_nome) LIKE '%CREME DE LEITE%'
         OR UPPER(produto_nome) LIKE '%PRESUNTO%' OR UPPER(produto_nome) LIKE '%MORTADELA%'
         OR UPPER(produto_nome) LIKE '%SALAME%' OR UPPER(produto_nome) LIKE '%MUSSARELA%'
         OR categoria IN ('laticínios/frios', 'laticínios', 'laticinios', 'frios')
    THEN 'laticínios/frios'
    
    -- LIMPEZA
    WHEN UPPER(produto_nome) LIKE '%DETERGENTE%' OR UPPER(produto_nome) LIKE '%SABÃO%'
         OR UPPER(produto_nome) LIKE '%SABAO%' OR UPPER(produto_nome) LIKE '%DESINFETANTE%'
         OR UPPER(produto_nome) LIKE '%ÁGUA SANITÁRIA%' OR UPPER(produto_nome) LIKE '%AGUA SANITARIA%'
         OR UPPER(produto_nome) LIKE '%AMACIANTE%' OR UPPER(produto_nome) LIKE '%ALVEJANTE%'
         OR UPPER(produto_nome) LIKE '%LIMPEZA%' OR UPPER(produto_nome) LIKE '%CLEAR%'
         OR categoria = 'limpeza'
    THEN 'limpeza'
    
    -- HIGIENE/FARMÁCIA
    WHEN UPPER(produto_nome) LIKE '%SABONETE%' OR UPPER(produto_nome) LIKE '%SHAMPOO%'
         OR UPPER(produto_nome) LIKE '%PASTA%DENTE%' OR UPPER(produto_nome) LIKE '%CREME%DENTAL%'
         OR UPPER(produto_nome) LIKE '%DESODORANTE%' OR UPPER(produto_nome) LIKE '%PAPEL%HIGIÊNICO%'
         OR UPPER(produto_nome) LIKE '%PAPEL%HIGIENICO%' OR UPPER(produto_nome) LIKE '%ABSORVENTE%'
         OR UPPER(produto_nome) LIKE '%MEDICAMENTO%' OR UPPER(produto_nome) LIKE '%VITAMINA%'
         OR UPPER(produto_nome) LIKE '%CONDICIONADOR%' OR UPPER(produto_nome) LIKE '%ESCOVA%DENTE%'
         OR categoria IN ('higiene/farmácia', 'higiene', 'farmácia', 'farmacia')
    THEN 'higiene/farmácia'
    
    -- CONGELADOS
    WHEN UPPER(produto_nome) LIKE '%SORVETE%' OR UPPER(produto_nome) LIKE '%CONGELADO%'
         OR UPPER(produto_nome) LIKE '%NUGGETS%' OR UPPER(produto_nome) LIKE '%PIZZA%CONGELADA%'
         OR UPPER(produto_nome) LIKE '%BATATA%FRITA%CONGELADA%' OR UPPER(produto_nome) LIKE '%HAMBÚRGUER%CONGELADO%'
         OR UPPER(produto_nome) LIKE '%HAMBURGER%CONGELADO%' OR UPPER(produto_nome) LIKE '%AÇAÍ%'
         OR UPPER(produto_nome) LIKE '%ACAI%' OR categoria = 'congelados'
    THEN 'congelados'
    
    -- PET
    WHEN UPPER(produto_nome) LIKE '%RAÇÃO%' OR UPPER(produto_nome) LIKE '%RACAO%'
         OR UPPER(produto_nome) LIKE '%PET%' OR UPPER(produto_nome) LIKE '%AREIA%GATO%'
         OR UPPER(produto_nome) LIKE '%COLEIRA%' OR UPPER(produto_nome) LIKE '%PETISCO%'
         OR UPPER(produto_nome) LIKE '%CACHORRO%' OR UPPER(produto_nome) LIKE '%GATO%'
         OR categoria = 'pet'
    THEN 'pet'
    
    -- OUTROS (caso não se encaixe em nenhuma categoria)
    ELSE 'outros'
END
WHERE categoria IS NOT NULL;