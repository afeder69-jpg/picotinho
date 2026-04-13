
## Corrigir exibição do telefone na listagem de "Telefones Autorizados" (mobile)

### Problema
No celular, o número formatado `(21) 97001-6024` junto com os badges "Principal" e "Verificado" está quebrando em múltiplas linhas, ficando ilegível (como mostrado na captura de tela).

### Solução
Ajustar o layout da lista de telefones em `src/pages/WhatsAppConfig.tsx` para que em telas pequenas o número fique em uma linha e os badges em outra, de forma organizada.

### Alterações

**Arquivo: `src/pages/WhatsAppConfig.tsx`**

1. **Linha ~621 (seção "Telefones Autorizados")**: Reorganizar o layout do item de telefone para que o número tenha `whitespace-nowrap` e os badges fiquem abaixo do número em telas pequenas, usando `flex-wrap` ou empilhamento vertical.

2. **Linha ~684 (seção "Preferências de Mensagens")**: Aplicar o mesmo ajuste na exibição do telefone nessa seção.

### Detalhes técnicos
- Adicionar `whitespace-nowrap` no `span` do número para nunca quebrar o telefone no meio
- Mudar o container dos badges + número para `flex flex-wrap` para que os badges caiam para a linha de baixo quando não couberem
- Garantir que o layout do card como um todo se adapte melhor em telas estreitas
