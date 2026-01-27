

# Otimização do Scanner de QR Code Web

## Diagnóstico do Problema

O scanner web atual (`QRCodeScannerWeb.tsx`) usa `@yudiel/react-qr-scanner` baseado em ZXing com configurações básicas:

```typescript
// Configuração atual - muito básica
<Scanner
  constraints={{
    facingMode: 'environment',
    aspectRatio: 1,  // ❌ Pode limitar qualidade
  }}
  formats={['qr_code', 'data_matrix']}
  scanDelay={300}  // ❌ 300ms pode ser muito lento
/>
```

### Por que a versão nativa é melhor?

| Característica | APK (ML Kit) | Web (ZXing) |
|---------------|--------------|-------------|
| Engine | Google ML Kit (Machine Learning) | ZXing (algoritmo tradicional) |
| Iluminação | Compensação automática por IA | Dependente da câmera |
| Velocidade | Otimizado por GPU/NPU | Processamento em JavaScript |
| Resolução | Acesso nativo à câmera | Limitado por APIs do navegador |

## Estratégia de Otimização

### 1. Substituir biblioteca por `html5-qrcode`

O projeto já tem `html5-qrcode` instalado (v2.3.8). Esta biblioteca oferece:

- **`useBarCodeDetectorIfSupported`**: Usa API nativa do navegador quando disponível (Chrome 83+)
- **Controle granular de câmera**: Exposição, foco, resolução
- **Flash/torch nativo**: Melhor controle de iluminação

### 2. Configurações avançadas para cupons fiscais

```typescript
const config = {
  fps: 15,                          // ⬆️ Aumentar de 2 para 15
  qrbox: { width: 300, height: 300 }, // Área de detecção maior
  aspectRatio: 1.0,
  disableFlip: true,                // Performance: cupons não são espelhados
  experimentalFeatures: {
    useBarCodeDetectorIfSupported: true  // API nativa quando disponível
  },
  videoConstraints: {
    facingMode: 'environment',
    width: { ideal: 1920 },         // Maior resolução
    height: { ideal: 1080 },
    advanced: [
      { focusMode: 'continuous' },  // Foco contínuo
      { exposureMode: 'continuous' } // Exposição automática
    ]
  }
};
```

### 3. Fallback de foto estática

Para casos onde o escaneamento em tempo real falha:

- Botão "Tirar Foto do QR Code"
- Captura imagem estática
- Processa com mais tempo e precisão
- Funciona melhor em condições de pouca luz

## Implementação Detalhada

### Novo componente: `QRCodeScannerWebOptimized.tsx`

```typescript
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

// Formatos otimizados para cupons fiscais brasileiros
const formatsToSupport = [
  Html5QrcodeSupportedFormats.QR_CODE,
  Html5QrcodeSupportedFormats.DATA_MATRIX,
];

// Configuração de câmera otimizada
const cameraConfig = {
  fps: 15,
  qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
    // QR box dinâmico - 80% da área visível
    const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
    return { width: minEdge * 0.8, height: minEdge * 0.8 };
  },
  aspectRatio: 1.0,
  disableFlip: true,
  experimentalFeatures: {
    useBarCodeDetectorIfSupported: true
  }
};

// Após iniciar, aplicar configurações avançadas de câmera
async function applyAdvancedSettings(scanner: Html5Qrcode) {
  try {
    const capabilities = scanner.getRunningTrackCapabilities();
    
    // Ativar foco contínuo se disponível
    if (capabilities.focusMode?.includes('continuous')) {
      await scanner.applyVideoConstraints({
        // @ts-ignore - API experimental
        advanced: [{ focusMode: 'continuous' }]
      });
    }
    
    // Ativar exposição automática se disponível
    if (capabilities.exposureMode?.includes('continuous')) {
      await scanner.applyVideoConstraints({
        // @ts-ignore - API experimental
        advanced: [{ exposureMode: 'continuous' }]
      });
    }
  } catch (e) {
    console.log('Configurações avançadas não suportadas:', e);
  }
}
```

### Modo de captura de foto (fallback)

```typescript
const capturePhoto = async () => {
  // Pausar scanner de vídeo
  await scanner.pause(true);
  
  // Capturar frame atual
  const imageData = scanner.getRunningTrackCameraSettings();
  
  // Processar imagem estática com mais tempo
  const result = await Html5Qrcode.scanFile(imageData, {
    formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
    experimentalFeatures: {
      useBarCodeDetectorIfSupported: true
    }
  });
  
  return result;
};
```

### Controle de lanterna (flash)

```typescript
const toggleTorch = async () => {
  try {
    const capabilities = scanner.getRunningTrackCapabilities();
    if (capabilities.torch) {
      const currentSettings = scanner.getRunningTrackSettings();
      await scanner.applyVideoConstraints({
        // @ts-ignore - API experimental
        advanced: [{ torch: !currentSettings.torch }]
      });
      setTorchEnabled(!torchEnabled);
    }
  } catch (e) {
    toast({
      title: "Flash não suportado",
      description: "Este dispositivo não suporta controle de flash",
      variant: "destructive"
    });
  }
};
```

## Interface do usuário melhorada

```
┌─────────────────────────────────────────────┐
│ [🔦 Flash]                    [❌ Cancelar] │
├─────────────────────────────────────────────┤
│                                             │
│     ┌─────────────────────────────┐         │
│     │                             │         │
│     │    ╔═══════════════════╗    │         │
│     │    ║                   ║    │         │
│     │    ║   ÁREA DE SCAN    ║    │         │
│     │    ║                   ║    │         │
│     │    ╚═══════════════════╝    │         │
│     │                             │         │
│     └─────────────────────────────┘         │
│                                             │
├─────────────────────────────────────────────┤
│  📸 Escaneando QR Code...                   │
│                                             │
│  ┌────────────────────────────────────────┐ │
│  │ 📷 Tirar Foto do QR Code               │ │
│  └────────────────────────────────────────┘ │
│                                             │
│  ┌────────────────────────────────────────┐ │
│  │ ⌨️ Digitar Chave Manualmente           │ │
│  └────────────────────────────────────────┘ │
│                                             │
│  💡 Se a leitura estiver difícil, tente:   │
│  • Aumentar a iluminação                    │
│  • Aproximar a câmera do QR Code            │
│  • Usar o botão "Tirar Foto"                │
└─────────────────────────────────────────────┘
```

## Arquivos a modificar

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `src/components/QRCodeScannerWeb.tsx` | Reescrever | Usar `html5-qrcode` com configurações otimizadas |

## Comparação: Antes vs Depois

| Aspecto | Antes | Depois |
|---------|-------|--------|
| FPS | 2-3 (padrão) | 15 |
| Resolução | Padrão do navegador | 1920x1080 (ideal) |
| Foco | Automático básico | Contínuo |
| Exposição | Automático básico | Contínua |
| API de detecção | ZXing (JavaScript) | BarcodeDetector nativo (quando disponível) |
| QR Box | Fixo 288x288 | Dinâmico 80% da tela |
| Fallback | Nenhum | Captura de foto |
| Flash | Simulado | API nativa |

## Benefícios esperados

1. **Velocidade**: Detecção 3-5x mais rápida
2. **Precisão**: Melhor leitura em condições adversas
3. **Iluminação**: Flash real + exposição automática
4. **Fallback**: Se tempo real falhar, tira foto
5. **Compatibilidade**: Funciona em mais navegadores

## Limitações conhecidas

- A versão web nunca será tão boa quanto ML Kit nativo
- Alguns navegadores antigos não suportam BarcodeDetector API
- Flash depende do hardware (nem todos smartphones suportam via web)
- A entrada manual de 44 dígitos continua sendo o fallback definitivo

