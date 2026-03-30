

## Plano revisado: WhatsApp Fase 3 — Relatórios por linguagem natural

### Lógica atual do frontend (confirmada no código)

O `Relatorios.tsx` funciona assim:
1. Busca `notas_imagens` processadas do usuário
2. Extrai itens do JSONB `dados_extraidos.itens` (campos: `descricao/nome`, `quantidade`, `valor_unitario`)
3. Extrai nome do estabelecimento de `dados_extraidos.estabelecimento.nome` (com fallbacks para `supermercado.nome` e `emitente.nome`)
4. Extrai data de emissão de `dados_extraidos.compra.data_emissao` (formato DD/MM/YYYY)
5. **Categoria**: busca na `estoque_app` do usuário — primeiro match exato por `UPPER(produto_nome)`, depois match parcial (`includes`)
6. Aplica filtros: categoria (exata UPPER), produto (busca parcial normalizada), mercado (exata), período (comparação de strings YYYY-MM-DD)

### Alterações

**1. Migration: criar 2 RPCs**

**`relatorio_compras_usuario`** — `SECURITY DEFINER`, recebe:
- `p_user_id UUID` (obrigatório)
- `p_data_inicio DATE` (opcional — se nulo, sem filtro inferior)
- `p_data_fim DATE` (opcional — se nulo, sem filtro superior)
- `p_estabelecimento TEXT` (opcional, `ILIKE '%' || p_estabelecimento || '%'`)
- `p_categoria TEXT` (opcional)
- `p_produto TEXT` (opcional, busca parcial `ILIKE`)

Lógica interna — réplica fiel do frontend:
- Seleciona `notas_imagens` onde `processada = true`, `excluida = false`, `usuario_id = p_user_id`
- Usa `jsonb_array_elements` para extrair itens de `dados_extraidos->'itens'`
- Extrai nome do estabelecimento com os mesmos 3 fallbacks do frontend (`estabelecimento.nome` → `supermercado.nome` → `emitente.nome`)
- Converte data de emissão DD/MM/YYYY para DATE (mesma lógica de `converterDataBrasileiraParaISO`)
- **Categoria**: faz LEFT JOIN com `estoque_app` do mesmo `user_id`, primeiro por match exato `UPPER(produto_nome) = UPPER(descricao_item)`, e se não encontrar, usa `POSITION` bidirecional (A contém B ou B contém A) — exatamente como o frontend faz com `includes`. Se nenhum match, retorna `'Não categorizado'`
- Aplica filtros de período, estabelecimento, categoria e produto
- Retorna: `data_compra DATE, produto TEXT, categoria TEXT, quantidade NUMERIC, valor_unitario NUMERIC, valor_total NUMERIC, estabelecimento TEXT`

**`listar_estabelecimentos_usuario`** — `SECURITY DEFINER`, recebe `p_user_id UUID`. Retorna nomes distintos de estabelecimentos extraídos do JSONB das notas processadas (mesmos fallbacks).

**2. Edge function `picotinho-assistant/index.ts`**

**Nova tool `consultar_relatorio`**:
```
name: "consultar_relatorio"
description: "Consulta relatório de compras do usuário com filtros opcionais.
  Retorna itens individuais com valores reais das notas fiscais.
  Use para QUALQUER pergunta sobre gastos, histórico de compras,
  'quanto comprei', 'o que comprei', 'resuma minhas compras'."
parameters:
  data_inicio: string (YYYY-MM-DD, opcional)
  data_fim: string (YYYY-MM-DD, opcional)
  estabelecimento: string (nome parcial, opcional)
  categoria: string (canônica, opcional)
  produto: string (nome parcial, opcional)
```

**Nova tool `listar_mercados_usuario`**:
```
name: "listar_mercados_usuario"
description: "Lista mercados/estabelecimentos onde o usuário já comprou.
  Use para desambiguação quando o nome for parcial ou houver dúvida."
parameters: {} (nenhum)
```

**Implementação em `executeTool`**:

`consultar_relatorio`:
- Chama `supabase.rpc('relatorio_compras_usuario', { p_user_id, p_data_inicio, p_data_fim, p_estabelecimento, p_categoria, p_produto })`
- Calcula `total_valor` e `total_itens` sobre todos os resultados
- Retorna JSON com:
  - `total_valor`, `total_itens`, `total_registros`
  - `itens`: até 30 registros (para caber no WhatsApp)
  - `resumo_por_categoria`: agrupamento com totais
  - `resumo_por_estabelecimento`: agrupamento com totais
  - Se `total_registros > 30`: campo `listagem_limitada: true` com mensagem "Exibindo 30 de X registros. Os totais refletem TODOS os X registros."
  - Totais sempre calculados sobre 100% dos dados, nunca sobre os 30 exibidos

`listar_mercados_usuario`:
- Chama `supabase.rpc('listar_estabelecimentos_usuario', { p_user_id })`
- Retorna lista de nomes

**Atualização do system prompt** — novo bloco "Regras de Relatórios":

```
Regras de Relatórios:
26. Use consultar_relatorio para QUALQUER pergunta sobre gastos, compras passadas ou relatórios.
27. Interprete períodos naturais e converta para YYYY-MM-DD:
    - "este mês" → primeiro dia do mês atual até hoje
    - "mês passado" → primeiro e último dia do mês anterior
    - "este ano" → 01/01 do ano atual até hoje
    - "ano passado" → 01/01 a 31/12 do ano anterior
    - "último trimestre" → 3 meses atrás até hoje
    - "entre janeiro e março" → 01/01 a 31/03 do ano atual
    - "ontem", "esta semana" → calcule as datas corretas
    Data de referência: {data_hoje}
28. PERÍODO NÃO É OBRIGATÓRIO. Se o usuário não especificar período:
    - Para consultas genéricas ("quanto comprei de arroz?"), execute a busca em TODO o histórico.
    - Ao responder, mencione que o resultado abrange todo o histórico disponível.
    - Se o resultado for muito amplo, SUGIRA ao usuário restringir por período, mas NÃO trave a consulta.
29. Categorias válidas: mercearia, bebidas, hortifruti, limpeza, açougue,
    laticínios/frios, higiene/farmácia, padaria, congelados, pet, outros.
    Sinônimos — aplique o MESMO mapeamento já usado no estoque:
    "material de limpeza"/"produtos de limpeza" → limpeza
    "carnes" → açougue
    "frutas"/"verduras" → hortifruti
    (usar sinonimoParaCanonico já existente no código)
30. Use listar_mercados_usuario quando o nome do mercado for ambíguo.
31. Formato da resposta:
    - "quanto comprei/gastei" → responda com TOTAL consolidado
    - "o que comprei/quais produtos" → responda com LISTAGEM de itens
    - "resuma/resumo" → responda com RESUMO por categoria ou mercado
32. Quando a listagem for limitada (mais de 30 itens), SEMPRE informe:
    o total consolidado (soma de TODOS os registros), seguido da indicação
    de quantos itens foram listados vs total real.
    Exemplo: "Total: R$ 450,00 em 85 itens. Listei os 30 mais recentes."
33. NUNCA invente valores. Toda resposta deve vir da tool consultar_relatorio.
```

### Cuidados específicos solicitados

1. **Categoria como réplica fiel**: a RPC usa exatamente a mesma lógica do frontend — LEFT JOIN com `estoque_app`, match exato UPPER primeiro, depois parcial bidirecional com `POSITION`. Nenhuma reinterpretação.

2. **Dependência de `estoque_app`**: produtos que existem nas notas mas nunca foram registrados no estoque aparecerão como "Não categorizado" — idêntico ao que o frontend mostra. Isso é o comportamento correto por design (memory: `filtro-estoque-real`).

3. **Período não obrigatório**: regra 28 do prompt permite consulta em todo o histórico. O assistente sugere restringir, mas não trava.

4. **Muitos resultados sem truncamento seco**: a tool retorna `total_valor` e `total_itens` calculados sobre TODOS os registros, mais `resumo_por_categoria` e `resumo_por_estabelecimento` completos. A limitação de 30 itens só afeta a listagem detalhada, e vem acompanhada de `listagem_limitada: true` + totais consolidados. O prompt instrui a IA a sempre informar o total real vs itens exibidos.

5. **Validação pós-implementação**: após o deploy, testar via `supabase--curl_edge_functions` comparando resultados da RPC com a lógica do frontend para os cenários: mercado, categoria, produto, período, e combinações.

### Escopo

- 1 migration (2 RPCs)
- 1 arquivo editado: `supabase/functions/picotinho-assistant/index.ts`
- Nenhuma alteração no frontend

