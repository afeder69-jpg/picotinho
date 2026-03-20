

## Plano: Adicionar campo EAN Comercial na edição de produtos

### Contexto
- `produtos_master_global` já tem coluna `codigo_barras` no banco
- `produtos_candidatos_normalizacao` NÃO tem coluna de EAN — o EAN vem do `estoque_app.ean_comercial` vinculado
- O formulário de edição (`editForm`) não inclui `codigo_barras` hoje

### Alterações em `src/pages/admin/NormalizacaoGlobal.tsx`

**1. Adicionar `codigo_barras` ao estado `editForm`** (linha 98-111)
- Incluir `codigo_barras: ''` no objeto inicial

**2. Preencher EAN ao abrir modal de candidato pendente** (`abrirModalEdicao`, linha 855-868)
- Adicionar `codigo_barras: ''` ao setEditForm
- Após preencher o form, buscar o EAN do `estoque_app` vinculado ao candidato: `estoque_app.ean_comercial WHERE produto_candidato_id = candidato.id LIMIT 1`
- Se encontrar, atualizar `editForm.codigo_barras`

**3. Preencher EAN ao abrir modal de produto master** (`editarProdutoMaster`, linha 1297-1310)
- Incluir `codigo_barras: produto.codigo_barras || ''` no setEditForm

**4. Salvar EAN na aprovação de candidato** (`aprovarComModificacoes`, linha 917-934)
- Adicionar `codigo_barras: editForm.codigo_barras || null` ao `insertData`

**5. Salvar EAN na edição de produto master** (`salvarEdicaoProdutoMaster`, linha 1363-1376)
- Adicionar `codigo_barras: editForm.codigo_barras || null` ao `updateData`

**6. Adicionar campo na UI do modal** (após o campo SKU Global, ~linha 2658)
- Input editável com label "EAN Comercial (Código de Barras)"
- Placeholder "Ex: 7891234567890"
- Sempre editável (diferente do SKU que é bloqueado em edição master)

### O que NÃO muda
- Nenhuma migração necessária (coluna `codigo_barras` já existe em `produtos_master_global`)
- Fluxo de aprovação, rejeição, catálogo master — intactos
- Nenhuma outra página ou componente afetado

