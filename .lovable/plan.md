

## Diagnóstico: Inconsistência de nomes de mercados no sistema

### Dimensão do problema

**Todos os 6 mercados ativos** têm divergência entre o nome na tabela `supermercados` (razão social) e o nome normalizado (nome comercial). Em 2 casos isso causa falha visível:

| CNPJ | Tabela `supermercados` | Nome normalizado | Match funciona? |
|---|---|---|---|
| `06057223041951` | SENDAS DISTRIBUIDORA S/A | ASSAI CESARIO DE MELO CG | **NÃO** |
| `39346861041437` | CENCOSUD BRASIL COMERCIAL SA | PREZUNIC BARRA | **NÃO** |
| `17493338000397` | COSTAZUL ALIMENTOS LTDA | COSTAZUL CESÁRIO DE MELO CG | Sim (contém "COSTAZUL") |
| `45543915025176` | CARREFOUR | CARREFOUR CG | Sim (contém "CARREFOUR") |
| `35881333000313` | MEGABOX | MEGABOX RECREIO | Sim (contém "MEGABOX") |
| `07760885001814` | SUPERMARKET | SUPERMARKET A.VASCONCELOS CG | Sim (contém "SUPERMARKET") |

### Causa raiz

Na função `buscar-supermercados-area` (linha 336), a normalização é chamada **sem passar o CNPJ**:

```typescript
// Atual — só nome, sem CNPJ
supabase.rpc('normalizar_nome_estabelecimento', {
  nome_input: supermercado.nome
});
```

A função RPC tem uma versão que aceita `cnpj_input` e prioriza busca por CNPJ (mais confiável). Porém, como não recebe o CNPJ, tenta match por nome — e quando a razão social (ex: "SENDAS DISTRIBUIDORA S/A") não contém o nome bruto da nota (ex: "LOJA 202 - CESARIO"), a normalização falha silenciosamente.

### Correção proposta

**Um único ponto de correção** em `buscar-supermercados-area/index.ts`, linha 336:

Passar o CNPJ do supermercado (já disponível no contexto como `cnpjSupermercado` ou via `idParaCnpj`) para a chamada RPC:

```typescript
const { data: nomeNormalizadoResult } = await supabase.rpc('normalizar_nome_estabelecimento', {
  nome_input: supermercado.nome,
  cnpj_input: idParaCnpj.get(supermercado.id) || supermercado.cnpj || null
});
```

Isso resolve **todos os casos** de uma vez — Sendas, Cencosud/Prezunic, e qualquer futuro mercado com razão social diferente do nome comercial — sem alterar mais nada no sistema.

### Impacto

- Nenhuma alteração em tabelas, regras de normalização ou outras funções
- Apenas 1 linha alterada em 1 edge function
- Todos os mercados passam a exibir o nome comercial correto em todas as telas

