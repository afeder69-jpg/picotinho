

## Diagnóstico: Relatório WhatsApp retorna vazio para "Costa Azul"

### Causa raiz

O nome armazenado no banco é **"COSTAZUL CESÁRIO DE MELO CG"** (sem espaço entre COSTA e AZUL). O assistente passou `"Costa Azul Cesário de Melo CG"` e `"Costa Azul-Cesário de Melo, CG"` para a RPC, que usa `ILIKE '%Costa Azul%'`. Como "Costa Azul" (com espaço) não aparece em "COSTAZUL" (sem espaço), o filtro não encontra nada.

O frontend não tem este problema porque usa um dropdown com os nomes exatos do banco — o usuário seleciona "COSTAZUL CESÁRIO DE MELO CG" diretamente, sem digitar.

### Problema secundário

A regra 30 do prompt diz "Use `listar_mercados_usuario` quando o nome do mercado for ambíguo", mas a IA não está chamando essa tool antes de `consultar_relatorio`. Ela passa o nome falado direto, sem validar se existe.

### Correção proposta

**1. Tornar o filtro de estabelecimento mais tolerante na RPC**

Alterar a RPC `relatorio_compras_usuario` para normalizar a comparação removendo espaços, hífens e caracteres especiais de ambos os lados antes do ILIKE:

```sql
-- De:
IF p_estabelecimento IS NOT NULL AND nome_estab NOT ILIKE '%' || p_estabelecimento || '%' THEN

-- Para: comparação normalizada (remove espaços, hífens, pontuação)
IF p_estabelecimento IS NOT NULL AND 
   REGEXP_REPLACE(UPPER(nome_estab), '[^A-Z0-9]', '', 'g') 
   NOT LIKE '%' || REGEXP_REPLACE(UPPER(p_estabelecimento), '[^A-Z0-9]', '', 'g') || '%' 
THEN
```

Isso faz "COSTAZUL" casar com "COSTA AZUL", "costa-azul", etc.

Aplicar a mesma normalização na RPC `listar_estabelecimentos_usuario` não é necessário (ela apenas lista nomes, sem filtrar).

**2. Reforçar o prompt para a IA usar `listar_mercados_usuario` proativamente**

Alterar a regra 30 de:
> "Use listar_mercados_usuario quando o nome do mercado for ambíguo ou parcial."

Para:
> "SEMPRE use listar_mercados_usuario ANTES de consultar_relatorio quando o usuário mencionar um mercado. Compare o nome falado com a lista retornada e use o nome exato do sistema."

**3. Redeploy da edge function**

### Escopo

- 1 migration (alterar RPC `relatorio_compras_usuario`)
- 1 arquivo editado: `supabase/functions/picotinho-assistant/index.ts` (prompt regra 30)

