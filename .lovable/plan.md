

## Corrigir overflow mobile completo na Normalização Global Master

### Problema
As abas foram corrigidas, mas os cards de candidatos pendentes e do catálogo continuam estourando a largura no celular. Os botões "Editar e Aprovar", "Aprovar" e "Rejeitar" ficam lado a lado junto com o título e badges numa mesma linha horizontal, impossível de caber em 350px.

### Areas com overflow identificadas

1. **Cards de Pendentes (linhas ~2740-2782)**: `flex items-start justify-between` coloca titulo+badges e 3 botões na mesma linha. No mobile, estoura.

2. **Cards do Catálogo Master (linhas ~2951-3000)**: Mesmo padrão — botão "Editar" + stats ao lado do título numa linha horizontal.

3. **Cards de Campanhas (linhas ~3234-3270)**: `flex items-center justify-between` com badges + dados de envio na mesma linha.

4. **Paginação (linha ~2829)**: `flex items-center justify-between` com texto + pagination links pode estourar.

5. **Titulo+badges dos candidatos (linha ~2742-2748)**: `flex items-center gap-2` sem `flex-wrap` faz os badges saírem da tela.

### Solução

**Arquivo: `src/pages/admin/NormalizacaoGlobal.tsx`**

1. **Cards de Pendentes** — Empilhar verticalmente no mobile:
   - Mudar o container principal de `flex items-start justify-between` para empilhamento vertical no mobile
   - Linha de badges (titulo + confiança + categoria): adicionar `flex-wrap`
   - Botões (Editar e Aprovar, Aprovar, Rejeitar): empilhar abaixo do conteúdo no mobile com `flex flex-col md:flex-row` ou `flex-wrap`, e no mobile usar `w-full` nos botões

2. **Cards do Catálogo Master** — Mesma abordagem:
   - Empilhar botão "Editar" e stats abaixo do título no mobile
   - Badges já têm `flex-wrap`, OK

3. **Cards de Campanhas** — Empilhar info + dados de envio:
   - Mudar para `flex flex-col md:flex-row` no container principal do card
   - Dados de envio ficam abaixo no mobile

4. **Paginação** — Empilhar texto + links:
   - Mudar para `flex flex-col gap-2 md:flex-row md:items-center md:justify-between`

5. **Adicionar `overflow-hidden` no container** para prevenir scroll horizontal residual

6. **Input de busca**: Remover `max-w-md` no mobile para ocupar a largura toda (`max-w-full md:max-w-md`)

### Detalhes técnicos
- Todas as alterações são exclusivamente CSS/Tailwind — zero impacto em funcionalidade
- Padrão principal: substituir `flex justify-between` por empilhamento vertical no mobile via `flex-col md:flex-row`
- Botões de ação em mobile: usar largura total ou `flex-wrap` com gap menor
- Arquivo único: `src/pages/admin/NormalizacaoGlobal.tsx`

