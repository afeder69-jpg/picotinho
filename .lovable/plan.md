

## Criar nova lista direto do dialog de "Adicionar à Lista"

### Alteração

**1 arquivo**: `src/components/consultaPrecos/AdicionarListaDialog.tsx`

Adicionar um mini-formulário inline no topo da lista de listas existentes, com input de nome + botão "Criar e adicionar".

### Lógica

1. Novo estado `novaLista` (string) e `criandoNova` (boolean)
2. Input de texto para nome da nova lista, sempre visível acima das listas existentes
3. Botão "Criar e adicionar" ao lado do input
4. Ao clicar:
   - Insere em `listas_compras` com `titulo`, `user_id`, `origem: 'manual'`
   - Pega o `id` retornado
   - Insere o produto em `listas_compras_itens` com esse `id`
   - Toast de sucesso e fecha o dialog
5. Mensagem "Nenhuma lista encontrada" é substituída por: mostrar apenas o formulário de criar nova (sem a mensagem negativa)

### Fluxo do usuário

- Abre o dialog → vê input "Nova lista" no topo + listas existentes abaixo
- Pode clicar numa lista existente (comportamento atual, intacto)
- Ou digitar nome e clicar "Criar e adicionar" → lista é criada + produto inserido automaticamente
- Dialog fecha com toast de sucesso

### Detalhes técnicos

```typescript
const handleCriarEAdicionar = async () => {
  // 1. Insert na tabela listas_compras
  const { data: lista } = await supabase
    .from('listas_compras')
    .insert({ titulo: novaLista.trim(), user_id: user.id, origem: 'manual' })
    .select('id')
    .single();

  // 2. Insert do produto na nova lista
  await supabase.from('listas_compras_itens').insert({
    lista_id: lista.id,
    produto_nome: produto.nome_padrao,
    produto_id: produto.id,
    quantidade: 1,
    unidade_medida: produto.unidade_base || 'UN',
    comprado: false,
  });
};
```

Nenhuma edge function necessária — inserção direta nas tabelas, que já têm RLS configurado para o usuário autenticado.

