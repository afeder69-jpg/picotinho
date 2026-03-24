

## Busca inteligente nos itens pendentes — mesmo padrão

### Situação atual

A função `buscarCandidatosPendentes` (linha 481) já busca todos os candidatos pendentes do banco e filtra localmente com `normalizarParaBusca`. Ela já é accent-insensitive e case-insensitive. Porém, o comportamento difere do padrão adotado nas outras buscas:

- Múltiplos termos com `;` usam lógica **OR** (qualquer termo basta)
- Não há lógica **AND entre palavras** dentro de um mesmo termo — se digitar "farinha milho", busca a string inteira, não cada palavra separadamente

### Solução

Manter a busca local (dados já vêm do banco, são candidatos pendentes — tabela diferente da `produtos_master_global`, então a RPC não se aplica). Ajustar a lógica de filtragem para:

1. Normalizar o termo (remover acentos, lowercase) — já faz via `normalizarParaBusca`
2. Dividir em palavras individuais (split por espaço e `;`)
3. Exigir que **todas** as palavras apareçam em **pelo menos um** dos campos concatenados (`texto_original`, `nome_padrao_sugerido`, `nome_base_sugerido`, `marca_sugerida`, etc.)

### Alteração

**1 arquivo**: `src/pages/admin/NormalizacaoGlobal.tsx` — função `buscarCandidatosPendentes`

Substituir a lógica de filtragem (linhas 499-515) por:

```typescript
// Extrair palavras (split por ; e espaços, mínimo 2 chars)
const palavras = normalizarParaBusca(termo)
  .split(/[;\s]+/)
  .filter(p => p.length >= 2);

if (palavras.length === 0) {
  setResultadosBuscaPendentes([]);
  return;
}

// Concatenar campos relevantes e exigir TODAS as palavras (AND)
const filtrados = (data || []).filter(candidato => {
  const textoCompleto = normalizarParaBusca(
    [candidato.texto_original, candidato.nome_padrao_sugerido,
     candidato.nome_base_sugerido, candidato.marca_sugerida,
     candidato.categoria_sugerida, candidato.sugestao_sku_global]
    .filter(Boolean).join(' ')
  );
  return palavras.every(p => textoCompleto.includes(p));
});

setResultadosBuscaPendentes(filtrados);
```

Isso alinha com o padrão das outras buscas: AND entre palavras, campos concatenados, accent/case-insensitive. Sem mudança no banco nem na RPC.

