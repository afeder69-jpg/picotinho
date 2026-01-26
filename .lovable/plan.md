

## 📸 Plano: Captura de Foto para URLs de DANFE (Sem QR Code)

### 📋 Problema Identificado
Alguns supermercados estão imprimindo apenas a **URL de texto** para consulta DANFE em vez do **QR Code**. Isso impede o funcionamento do scanner atual que só lê códigos visuais.

### 🎯 Solução Proposta
Adicionar uma **opção alternativa** no scanner: quando o usuário não conseguir escanear o QR Code, ele pode tirar uma **foto da URL impressa** e o sistema usará **OCR (OpenAI Vision)** para extrair a URL da imagem.

---

### 🔧 Componentes a Implementar

#### **1. Nova Edge Function: `extract-url-from-photo`**
Função dedicada para extrair URLs de imagens usando OpenAI Vision.

**Localização:** `supabase/functions/extract-url-from-photo/index.ts`

**Funcionalidade:**
- Recebe imagem em base64
- Envia para OpenAI Vision com prompt específico para extrair URLs HTTPS
- Retorna a URL encontrada (se houver)

```text
┌─────────────────────────────────────────────────────────────┐
│                   FLUXO DA NOVA FUNÇÃO                       │
├─────────────────────────────────────────────────────────────┤
│  1. Usuário tira foto da URL impressa                        │
│  2. Frontend envia imagem base64 para edge function          │
│  3. OpenAI Vision analisa e extrai URL                       │
│  4. Se URL válida → retorna para processamento normal        │
│  5. Frontend chama handleQRScanSuccess() com a URL           │
└─────────────────────────────────────────────────────────────┘
```

#### **2. Modificar `QRCodeScannerWeb.tsx`**
Adicionar botão "📷 Tirar Foto da URL" no componente de scanner web.

**Mudanças:**
- Novo botão na interface do scanner
- Handler para capturar foto via câmera
- Chamada para a nova edge function
- Loading state durante processamento OCR

#### **3. Modificar `QRCodeScanner.tsx` (Nativo)**
Adicionar a mesma funcionalidade no scanner nativo usando `@capacitor/camera`.

**Mudanças:**
- Botão "📷 Tirar Foto da URL" 
- Usar `Camera.getPhoto()` (já disponível no projeto)
- Enviar para edge function e processar resultado

#### **4. Atualizar `supabase/config.toml`**
Registrar nova edge function.

---

### 🎨 Design da Interface

#### Estado Atual do Scanner
```text
┌─────────────────────────────────────┐
│  [🔦]                    [❌ Cancelar]  │
├─────────────────────────────────────┤
│                                      │
│         ┌──────────────┐             │
│         │              │             │
│         │   📷 QR      │             │
│         │   Scanner    │             │
│         │              │             │
│         └──────────────┘             │
│                                      │
├─────────────────────────────────────┤
│  📍 Escaneando QR Code              │
│  Aponte a câmera para o QR Code     │
└─────────────────────────────────────┘
```

#### Novo Design com Opção de Foto
```text
┌─────────────────────────────────────┐
│  [🔦]                    [❌ Cancelar]  │
├─────────────────────────────────────┤
│                                      │
│         ┌──────────────┐             │
│         │              │             │
│         │   📷 QR      │             │
│         │   Scanner    │             │
│         │              │             │
│         └──────────────┘             │
│                                      │
├─────────────────────────────────────┤
│  📍 Escaneando QR Code              │
│  Aponte a câmera para o QR Code     │
│                                      │
│  ─────────── ou ───────────         │
│                                      │
│  ┌─────────────────────────────┐    │
│  │  📸 Tirar Foto da URL       │    │
│  │  (Sem QR Code no cupom)     │    │
│  └─────────────────────────────┘    │
└─────────────────────────────────────┘
```

---

### 📐 Detalhes Técnicos

#### Prompt para OpenAI Vision (Extração de URL)
```text
Você é um especialista em extrair URLs de imagens de documentos.
Analise esta imagem e encontre QUALQUER URL de consulta de nota fiscal.

Procure por:
- URLs que começam com "https://" ou "http://"
- Endereços de consulta DANFE/NFe/NFCe
- Links da Fazenda ou portais de nota fiscal

Se encontrar uma URL válida, retorne APENAS a URL completa.
Se não encontrar nenhuma URL, retorne "NOT_FOUND".

IMPORTANTE: 
- Retorne APENAS a URL, sem explicações
- Se houver múltiplas URLs, retorne a que parece ser de consulta fiscal
```

#### Fluxo de Dados
```text
┌──────────────────────────────────────────────────────────────────────┐
│                         FLUXO COMPLETO                                │
└──────────────────────────────────────────────────────────────────────┘

   Usuário                Scanner                Edge Function
      │                      │                        │
      │  Clica "Tirar Foto"  │                        │
      │ ────────────────────>│                        │
      │                      │                        │
      │                      │  Abre câmera           │
      │                      │<────────────           │
      │                      │                        │
      │   Captura foto       │                        │
      │ ────────────────────>│                        │
      │                      │                        │
      │                      │  POST base64           │
      │                      │ ──────────────────────>│
      │                      │                        │
      │                      │                   ┌────┴────┐
      │                      │                   │ OpenAI  │
      │                      │                   │ Vision  │
      │                      │                   └────┬────┘
      │                      │                        │
      │                      │  { url: "https://..." }│
      │                      │ <──────────────────────│
      │                      │                        │
      │                      │  handleQRScanSuccess(url)
      │                      │<────────────           │
      │                      │                        │
      │  Processamento       │                        │
      │  automático normal   │                        │
      │<─────────────────────│                        │
```

---

### 📁 Arquivos a Criar/Modificar

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `supabase/functions/extract-url-from-photo/index.ts` | **Criar** | Nova edge function para OCR de URL |
| `src/components/QRCodeScannerWeb.tsx` | **Modificar** | Adicionar botão "Tirar Foto da URL" |
| `src/components/QRCodeScanner.tsx` | **Modificar** | Adicionar botão "Tirar Foto da URL" (nativo) |
| `supabase/config.toml` | **Modificar** | Registrar nova edge function |

---

### ✅ Vantagens da Solução

1. **Não quebra o fluxo existente**: O scanner de QR Code continua funcionando normalmente
2. **Fallback inteligente**: Usuário só usa a foto quando necessário
3. **Reutiliza infraestrutura**: OpenAI Vision já está configurado no projeto
4. **Processamento automático**: Após extrair a URL, o fluxo normal continua (100% automático)
5. **Funciona em ambas plataformas**: Web e nativo (Android/iOS)

---

### 🚀 Estimativa de Implementação

**Tempo estimado:** 20-30 minutos

**Dependências:**
- ✅ `@capacitor/camera` - Já instalado
- ✅ OpenAI API Key - Já configurada
- ✅ Supabase Edge Functions - Já configuradas

**Testes necessários:**
- ✅ Tirar foto de URL impressa e verificar extração
- ✅ URL extraída deve funcionar no fluxo normal (process-url-nota)
- ✅ Tratamento de erro quando URL não encontrada
- ✅ Funcionamento em web e app nativo

