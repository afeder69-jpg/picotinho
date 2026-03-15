

# Padronizar Web Scanner com mesmo fluxo do APK

## O que será feito

Adicionar uma tela de escolha inicial no `QRCodeScannerWeb.tsx`, idêntica à do APK, com `mode` state (`'choose' | 'scanning' | 'manual'`). O scanner só inicia ao clicar em "Escanear QR Code".

## Alteração: `src/components/QRCodeScannerWeb.tsx`

1. Adicionar estado `mode: 'choose' | 'scanning' | 'manual'` (inicial: `'choose'`)
2. Remover `startScanner()` do `useEffect` — scanner não inicia automaticamente
3. Adicionar import `ArrowLeft, QrCode` do lucide-react
4. Renderizar conforme o mode:
   - **`'choose'`**: Tela com título "Ler Nota Fiscal" + subtítulo "Escolha como deseja informar a nota fiscal" + dois botões (Escanear QR Code / Digitar Chave Manualmente) + botão Voltar no header — layout idêntico ao APK
   - **`'scanning'`**: Interface atual do scanner (câmera + overlay + controles) — inicia `startScanner()` ao entrar neste mode
   - **`'manual'`**: Renderiza `ManualKeyInput` com `onClose={() => setMode('choose')}`
5. Remover o `showManualInput` state (substituído pelo mode)
6. Ao clicar "Cancelar" durante scanning → `stopScanner()` + voltar para `mode = 'choose'` (não fechar o componente)
7. Botão "Voltar" na tela de escolha chama `onClose()`

## Arquivo alterado

| Arquivo | Alteração |
|---|---|
| `src/components/QRCodeScannerWeb.tsx` | Adicionar mode state + tela de escolha + scanner sob demanda |

## Garantias

- Lógica de scan, torch, ManualKeyInput inalterados
- Nenhuma API/edge function alterada
- Mesmo visual e fluxo do APK

