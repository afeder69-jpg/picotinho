

## Plano: Substituir upload por botão de leitura na página "Minhas Notas Fiscais"

### Problema
A página `Screenshots.tsx` usa o componente `UploadNoteButton` (upload de arquivo), que não faz mais parte do fluxo desejado. Precisa ser substituído pelo mesmo fluxo de scanner (QR Code / chave manual / código de barras) que já existe no `BottomNavigation`.

### Abordagem
O fluxo de scan + processamento automático está todo encapsulado no `BottomNavigation` (função `handleQRScanSuccess` + Realtime listeners). Em vez de duplicar essa lógica, a solução mais limpa é:

1. **Remover `UploadNoteButton`** da página `Screenshots.tsx` (e o import)
2. **Adicionar um botão que dispara o scanner** — reutilizando o mesmo mecanismo que o botão central do `BottomNavigation` já usa (`setShowQRScanner(true)`)
3. Como o `BottomNavigation` já está presente em todas as páginas (incluindo `/screenshots`), basta **disparar a abertura do scanner via um estado compartilhado ou evento**

### Implementação

**Opção escolhida**: Usar um custom event para comunicar entre `Screenshots` e `BottomNavigation`, evitando criar contexto adicional.

#### 1. `src/pages/Screenshots.tsx`
- Remover import e uso de `UploadNoteButton`
- Remover `handleUploadSuccess` e estado associado ao upload
- Adicionar botão "Ler Nota Fiscal" com ícone `QrCode` que dispara `window.dispatchEvent(new Event('open-scanner'))`
- Manter `refreshKey` — pode ser incrementado via listener de evento de sucesso

#### 2. `src/components/BottomNavigation.tsx`
- Adicionar listener para o evento `open-scanner` que chama `setShowQRScanner(true)`
- Isso reaproveita 100% do fluxo existente sem duplicação

#### 3. `src/components/UploadNoteButton.tsx`
- Manter o arquivo (pode ser usado em outro lugar no futuro), mas remover da página Screenshots

### Resultado
- Na página "Minhas Notas Fiscais": botão destacado "Ler Nota Fiscal" com ícone de QR Code
- Ao clicar: abre o mesmo scanner com as 3 opções (QR Code, chave manual, código de barras)
- Processamento segue o pipeline existente automaticamente
- Nenhuma alteração no fluxo de processamento ou em outras telas

