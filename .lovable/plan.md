

## Plano: Melhorar observabilidade da presença no WhatsApp

### Resumo

Adicionar logs detalhados na função `updatePresence` para capturar o status HTTP e o body da resposta da Z-API, permitindo diagnóstico preciso de por que a presença não está aparecendo visualmente.

### O que será feito

**1 arquivo editado:** `supabase/functions/picotinho-assistant/index.ts`

**Alteração na função `updatePresence`** (linhas 1484-1494):

Substituir o log simplificado por logs completos:

```typescript
async function updatePresence(phone: string, status: 'typing' | 'recording' | 'available'): Promise<void> {
  const instanceUrl = Deno.env.get('WHATSAPP_INSTANCE_URL');
  const apiToken = Deno.env.get('WHATSAPP_API_TOKEN');
  const accountSecret = Deno.env.get('WHATSAPP_ACCOUNT_SECRET');
  
  if (!instanceUrl || !apiToken) {
    console.log(`⚠️ [PRESENCE] Credenciais ausentes, pulando ${status}`);
    return;
  }
  
  try {
    const url = `${instanceUrl}/token/${apiToken}/update-presence`;
    const payload = { phone, status };
    console.log(`👁️ [PRESENCE] Enviando: URL=${url} | payload=${JSON.stringify(payload)}`);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accountSecret ? { 'Client-Token': accountSecret } : {})
      },
      body: JSON.stringify(payload)
    });
    
    const responseBody = await response.text();
    console.log(`👁️ [PRESENCE] ${status} → HTTP ${response.status} | body: ${responseBody}`);
  } catch (err) {
    console.log(`⚠️ [PRESENCE] Falha ao enviar ${status}: ${err}`);
  }
}
```

### O que muda nos logs

**Antes:**
```
👁️ [PRESENCE] recording → OK
```

**Depois:**
```
👁️ [PRESENCE] Enviando: URL=https://api.z-api.io/instances/.../token/.../update-presence | payload={"phone":"5544999999999","status":"typing"}
👁️ [PRESENCE] typing → HTTP 200 | body: {"value":true}
```

### O que NÃO muda

- Nenhuma alteração no fluxo de envio de texto ou áudio
- Nenhuma mensagem extra na conversa
- O try/catch continua protegendo o fluxo principal
- Nenhuma migration, nenhuma alteração no frontend

### Próximo passo após deploy

Com os logs detalhados, basta enviar uma mensagem de teste ao Picotinho e verificar nos logs:
1. A URL exata montada
2. O telefone enviado
3. O status HTTP retornado
4. O body da resposta da Z-API

Com essa informação, saberemos se o problema está no endpoint, no formato do telefone, na autenticação, ou se a API aceita mas o WhatsApp simplesmente não exibe a presença nesse contexto.

### Escopo

- 1 função alterada: `updatePresence` (~15 linhas modificadas)
- Redeploy da edge function `picotinho-assistant`

