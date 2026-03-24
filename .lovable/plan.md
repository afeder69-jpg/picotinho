

## Busca inteligente no filtro de produto dos Relatórios

### Situação atual

O Combobox dos Relatórios usa o filtro built-in do `Command` (linha 68-70):

```
filter={(value, search) => normalizarParaBusca(value).includes(normalizarParaBusca(search)) ? 1 : 0}
```

Isso já é accent-insensitive e case-insensitive via `normalizarParaBusca`. Porém, trata o termo como string contígua — digitar "farinha milho" busca essa sequência exata, não cada palavra independentemente.

### Solução

Alterar a função `filter` do Combobox **apenas na instância dos Relatórios** para suportar multi-palavra AND. Duas opções:

- **Opção A**: Atualizar o componente `Combobox` globalmente para que o filtro padrão já use lógica AND entre palavras. Isso beneficia todo o sistema.
- **Opção B**: Passar um `filter` customizado só nos Relatórios.

A opção A é preferível — alinha o Combobox com o padrão do sistema sem esforço extra em cada uso.

### Alteração

**1 arquivo**: `src/components/ui/combobox.tsx`

Atualizar a função filter (linha 68-70) de:

```typescript
filter={(value, search) => {
  return normalizarParaBusca(value).includes(normalizarParaBusca(search)) ? 1 : 0;
}}
```

Para:

```typescript
filter={(value, search) => {
  const normalizedValue = normalizarParaBusca(value);
  const palavras = normalizarParaBusca(search).split(/\s+/).filter(p => p.length >= 1);
  if (palavras.length === 0) return 1;
  return palavras.every(p => normalizedValue.includes(p)) ? 1 : 0;
}}
```

Isso faz com que "farinha milho" encontre "Farinha de Milho Flocão Maratá 500g" — cada palavra precisa estar presente (AND), em qualquer posição, accent/case-insensitive.

Nenhuma outra alteração necessária. O Combobox dos Relatórios (e de qualquer outro lugar que use o componente) passa automaticamente a ter busca multi-palavra AND.

