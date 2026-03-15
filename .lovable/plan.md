

# Ajuste QR Code Scanner: APK + Web

## Alterações

### 1. `src/components/QRCodeScanner.tsx` (APK)

**Problema:** O `startScan()` é chamado automaticamente no `useEffect`, abrindo o scanner nativo fullscreen que cobre tudo. Quando o usuário fecha o scanner nativo, o catch genérico mostra "Erro no scanner".

**Solução:**
- Adicionar estado `mode: 'choose' | 'scanning' | 'manual'` (inicial: `'choose'`)
- Remover `startScan()` do `useEffect`
- Renderizar tela de escolha quando `mode === 'choose'`:
  - Botão "Escanear QR Code" → seta mode `'scanning'` e chama `startScan()`
  - Botão "Digitar Chave Manualmente" → seta mode `'manual'` e mostra `ManualKeyInput`
- No `catch` do `startScan()`: detectar cancelamento do usuário (o ML Kit lança erro com "canceled" ou "cancelled" quando o usuário fecha). Nesse caso, **não mostrar toast de erro**, apenas voltar para `mode = 'choose'`
- Ajustar `stopScan()` para não chamar `onClose()` automaticamente — voltar para tela de escolha em vez de fechar o componente
- Adicionar botão "Voltar" na tela de escolha que chama `onClose()`

### 2. `src/components/QRCodeScannerWeb.tsx` (Web)

**Remoções:**
- Remover estado `isCapturing`
- Remover função `capturePhoto`
- Remover import `Camera` do lucide-react
- Remover botão "Tirar Foto do QR Code" (linhas 357-366)
- Atualizar dica no rodapé removendo menção a "Tirar Foto"

Manter tudo mais intacto: scanner, torch, botão "Digitar Chave Manualmente", ManualKeyInput.

## Arquivos Alterados

| Arquivo | O quê |
|---|---|
| `src/components/QRCodeScanner.tsx` | Tela de escolha antes do scanner nativo + tratamento de cancelamento sem erro |
| `src/components/QRCodeScannerWeb.tsx` | Remoção do botão "Tirar Foto" e código associado |

## Garantias

- Lógica de processamento de notas intacta
- APIs e edge functions inalteradas
- `ManualKeyInput` e `construirUrlConsulta` inalterados
- Fluxo web de scan contínuo inalterado

