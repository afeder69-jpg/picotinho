

## Plano: Presença no WhatsApp (typing/recording)

### Resumo

Adicionar uma função `updatePresence` no `picotinho-assistant/index.ts` que chama o endpoint `update-presence` da Z-API, e invocar essa função nos momentos-chave do processamento para que o usuário veja "digitando" ou "gravando áudio" enquanto aguarda a resposta.

### O que será feito

**1 arquivo editado:** `supabase/functions/picotinho-assistant/index.ts`

**Nova função `updatePresence`** (após a função `sendWhatsAppAudio`, ~linha 1474):

```typescript
async function updatePresence(phone: string, status: 'typing' | 'recording' | 'available'): Promise<void> {
  const instanceUrl = Deno.env.get('WHATSAPP_INSTANCE_URL');
  const apiToken = Deno.env.get('WHATSAPP_API_TOKEN');
  const accountSecret = Deno.env.get('WHATSAPP_ACCOUNT_SECRET');
  
  if (!instanceUrl || !apiToken) return;
  
  try {
    const url = `${instanceUrl}/token/${apiToken}/update-presence`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accountSecret ? { 'Client-Token': accountSecret } : {})
      },
      body: JSON.stringify({ phone, status })
    });
    console.log(`👁️ [PRESENCE] ${status} → ${response.ok ? 'OK' : 'FALHOU'}`);
  } catch (err) {
    console.log(`⚠️ [PRESENCE] Falha ao enviar ${status}: ${err}`);
  }
}
```

- Envolvida em try/catch — **nunca bloqueia** a resposta principal
- Usa as mesmas credenciais Z-API já configuradas (WHATSAPP_INSTANCE_URL, WHATSAPP_API_TOKEN, WHATSAPP_ACCOUNT_SECRET)
- Log silencioso: registra sucesso/falha sem interromper o fluxo

**Inserções de chamada no fluxo existente (3 pontos):**

1. **Antes do loop de IA** (~linha 1849, antes do `while`): enviar `typing` para indicar que o processamento começou
   ```typescript
   await updatePresence(remetente, 'typing');
   ```

2. **Antes da geração de TTS** (~linha 2019, dentro do `if modoResposta === 'audio' || 'ambos'`): trocar para `recording` antes de chamar `generateTTS`
   ```typescript
   await updatePresence(remetente, 'recording');
   ```

3. **Após envio da resposta** (~linha 2041, depois de persistir no banco): voltar para `available`
   ```typescript
   await updatePresence(remetente, 'available');
   ```

### Comportamento final

| Momento | Presença enviada |
|---------|-----------------|
| Início do processamento (antes da IA) | `typing` |
| Antes de gerar TTS (se modo áudio/ambos) | `recording` |
| Após enviar resposta | `available` |

### O que NÃO muda

- Nenhuma alteração no envio de texto ou áudio
- Nenhuma mensagem extra na conversa
- Nenhuma migration
- Nenhuma alteração no frontend
- Se a presença falhar, o fluxo continua normalmente

### Escopo

- 1 função nova: `updatePresence` (~20 linhas)
- 3 linhas de chamada inseridas no fluxo existente
- Redeploy da edge function `picotinho-assistant`

