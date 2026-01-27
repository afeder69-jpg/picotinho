

# Adicionar Entrada Manual da Chave de Acesso (44 dígitos)

## Objetivo
Permitir que o usuário digite manualmente a chave de acesso de 44 dígitos quando o QR Code do cupom fiscal estiver danificado ou ilegível.

## Por que isso é útil
- Muitos cupons fiscais têm QR Codes danificados por dobras, manchas ou impressão ruim
- A chave de 44 dígitos está SEMPRE impressa no cupom (geralmente no topo ou rodapé)
- Permite recuperar notas que seriam impossíveis de escanear

## Estrutura da Chave de 44 Dígitos

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│  CHAVE DE ACESSO: 44 dígitos numéricos                                       │
├──────────────────────────────────────────────────────────────────────────────┤
│  Posições 0-1:   UF (código do estado: 33=RJ, 35=SP, etc.)                   │
│  Posições 2-5:   AAMM (ano e mês de emissão)                                 │
│  Posições 6-19:  CNPJ do emitente                                            │
│  Posições 20-21: Modelo (55=NFe, 65=NFCe)                                    │
│  Posições 22-24: Série                                                       │
│  Posições 25-33: Número da nota                                              │
│  Posições 34-34: Tipo de emissão                                             │
│  Posições 35-42: Código numérico                                             │
│  Posições 43-43: Dígito verificador                                          │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Implementação

### 1. Novo Componente: `ManualKeyInput.tsx`
Criar um componente de entrada manual com:
- Input para 44 dígitos numéricos
- Validação em tempo real
- Formatação visual (grupos de 4 dígitos)
- Botão de confirmar

### 2. Modificar Scanners
Adicionar botão "Digitar Chave" nos dois scanners:
- `QRCodeScannerWeb.tsx` (web/preview)
- `QRCodeScanner.tsx` (app nativo)

### 3. Reutilizar Fluxo Existente
O `process-url-nota` já aceita `chaveAcesso` diretamente. Precisamos apenas construir uma URL de consulta baseada na chave.

## Detalhes Técnicos

### Componente ManualKeyInput.tsx

```typescript
interface ManualKeyInputProps {
  onSubmit: (chaveAcesso: string) => void;
  onClose: () => void;
}
```

Funcionalidades:
- Input com máscara para aceitar apenas dígitos
- Limite de 44 caracteres
- Contador visual (ex: "38/44 dígitos")
- Validação do dígito verificador (posição 43)
- Validação do modelo (posição 20-21 = 55 ou 65)
- Feedback visual de progresso

### Validação da Chave

```typescript
function validarChaveAcesso(chave: string): { valida: boolean; erro?: string } {
  // Remover espaços e caracteres não numéricos
  const limpa = chave.replace(/\D/g, '');
  
  if (limpa.length !== 44) {
    return { valida: false, erro: `Chave incompleta: ${limpa.length}/44 dígitos` };
  }
  
  const uf = limpa.substring(0, 2);
  const modelo = limpa.substring(20, 22);
  
  // Verificar UF válida (11-53)
  if (parseInt(uf) < 11 || parseInt(uf) > 53) {
    return { valida: false, erro: 'Código de estado inválido' };
  }
  
  // Verificar modelo (55=NFe ou 65=NFCe)
  if (modelo !== '55' && modelo !== '65') {
    return { valida: false, erro: 'Modelo de documento inválido' };
  }
  
  return { valida: true };
}
```

### Construir URL a partir da Chave

Para processar a chave, construímos uma URL de consulta padrão:

```typescript
function construirUrlConsulta(chaveAcesso: string): string {
  const uf = chaveAcesso.substring(0, 2);
  const modelo = chaveAcesso.substring(20, 22);
  
  if (modelo === '65') {
    // NFCe - URL genérica de consulta
    return `https://www.nfce.fazenda.gov.br/portal/consultarNFCe.aspx?chNFe=${chaveAcesso}`;
  } else {
    // NFe - URL genérica de consulta
    return `https://www.nfe.fazenda.gov.br/portal/consultarNFe.aspx?chNFe=${chaveAcesso}`;
  }
}
```

## UI/UX do Componente

```text
┌─────────────────────────────────────────────┐
│  ✕                                          │
├─────────────────────────────────────────────┤
│                                             │
│     ⌨️ Digitar Chave de Acesso              │
│                                             │
│  A chave de 44 dígitos está impressa        │
│  no cupom fiscal, geralmente no topo        │
│  ou rodapé do documento.                    │
│                                             │
│  ┌───────────────────────────────────────┐  │
│  │ 3323 0812 3456 7890 1234 5678        │  │
│  │ 9012 3456 7890 12__                  │  │
│  └───────────────────────────────────────┘  │
│                                             │
│          38/44 dígitos ✓                    │
│                                             │
│  ┌───────────────────────────────────────┐  │
│  │          Processar Nota               │  │
│  └───────────────────────────────────────┘  │
│                                             │
└─────────────────────────────────────────────┘
```

## Modificações nos Scanners

### QRCodeScannerWeb.tsx
Adicionar botão na área de instruções (linhas 145-159):

```typescript
<Button
  variant="outline"
  className="w-full mt-4"
  onClick={() => setShowManualInput(true)}
>
  <Keyboard className="w-4 h-4 mr-2" />
  Digitar Chave Manualmente
</Button>
```

### QRCodeScanner.tsx
Adicionar botão similar na área de instruções (linhas 189-196).

## Fluxo Completo

```text
┌─────────────────┐
│ Usuário clica   │
│ no botão de     │
│ escanear        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Abre Scanner    │
│ (QRCode ou Web) │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌─────────┐ ┌─────────────┐
│ Escanear│ │ Digitar     │
│ QR Code │ │ Chave       │
└────┬────┘ └──────┬──────┘
     │             │
     └──────┬──────┘
            │
            ▼
┌─────────────────────┐
│ handleQRScanSuccess │
│ ou                  │
│ handleManualKey     │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ process-url-nota    │
│ (Edge Function)     │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Processamento       │
│ normal automático   │
└─────────────────────┘
```

## Arquivos a Criar/Modificar

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `src/components/ManualKeyInput.tsx` | Criar | Novo componente de entrada manual |
| `src/lib/documentDetection.ts` | Modificar | Adicionar funções de validação e construção de URL |
| `src/components/QRCodeScannerWeb.tsx` | Modificar | Adicionar botão para entrada manual |
| `src/components/QRCodeScanner.tsx` | Modificar | Adicionar botão para entrada manual (app nativo) |
| `src/components/BottomNavigation.tsx` | Modificar | Adicionar handler para chave manual |

## Benefícios

1. **Recuperação de notas** - Cupons com QR Code danificado podem ser processados
2. **Fallback confiável** - A chave de 44 dígitos nunca falha
3. **UX amigável** - Formatação visual facilita a digitação
4. **Validação em tempo real** - Erros detectados antes de enviar

