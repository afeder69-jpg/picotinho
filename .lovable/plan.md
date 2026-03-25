

## Diagnóstico: Fluxo de Áudio no WhatsApp

### Ponto exato da quebra

**Linha 1062-1072 de `picotinho-assistant/index.ts`:**

```typescript
// 2. Handle audio — not yet supported
if (tipoMensagem === 'audio') {
  const audioMsg = "🎤 Em breve vou entender áudios! Por enquanto, me mande por texto que eu te ajudo. 😊";
  await sendWhatsAppMessage(remetente, audioMsg);
  // ... marca como processada e retorna
  return new Response(...);
}
```

O assistente **bloqueia explicitamente** mensagens de áudio com um early return, antes mesmo de tentar transcrever. A Edge Function `transcribe-audio` existe e está funcional, mas **nunca é chamada** em nenhum ponto do fluxo.

### Comparação: fluxo antigo vs atual

| Etapa | Fluxo antigo (legado) | Fluxo atual (assistente) |
|---|---|---|
| Webhook detecta áudio | Detecta corretamente, salva `tipo_mensagem: 'audio'` e `anexo_info` com URL | Idêntico — sem mudança |
| Transcrição | Era feita pelo webhook ou por processamento separado | **Nunca acontece** — bloqueado no assistant |
| Assistente recebe | Recebia texto transcrito | Recebe tipo `audio`, responde "em breve" e para |

### Resumo do problema

1. **Webhook** (`whatsapp-webhook`): funciona corretamente — detecta áudio, extrai URL, salva `anexo_info` com a URL de download, e roteia para `picotinho-assistant`
2. **Assistant** (`picotinho-assistant`): recebe a mensagem, verifica `tipoMensagem === 'audio'`, e **retorna imediatamente** com mensagem "em breve vou entender áudios" sem chamar `transcribe-audio`
3. **`transcribe-audio`**: existe, usa Whisper da OpenAI, suporta download via Z-API — mas está órfã, ninguém a invoca

### Plano de correção

**Arquivo:** `supabase/functions/picotinho-assistant/index.ts`

**Mudança única — substituir o bloco de early return (linhas 1062-1072) por lógica de transcrição:**

Em vez de responder "em breve", o assistente deve:

1. Extrair a URL do áudio de `mensagem.anexo_info.url`
2. Invocar `transcribe-audio` via `supabase.functions.invoke('transcribe-audio', { body: { audioUrl } })`
3. Se a transcrição for bem-sucedida:
   - Substituir a variável `conteudo` pelo texto transcrito
   - Atualizar a mensagem no banco com o conteúdo transcrito (`conteudo = textoTranscrito`)
   - Continuar o fluxo normal do assistente (sem return)
4. Se falhar:
   - Enviar mensagem ao usuário pedindo para repetir por texto
   - Retornar (mantém o early return apenas em caso de erro)

```text
Fluxo corrigido:

áudio recebido
  → extrair URL do anexo_info
  → invocar transcribe-audio
  → texto transcrito
  → sobrescrever variável conteudo
  → atualizar whatsapp_mensagens.conteudo
  → continuar fluxo normal do assistente (tool calling, LLM, etc.)
```

### Detalhes técnicos

- `mensagem.anexo_info` já contém `{ tipo: 'audio', url: '...', mimetype: 'audio/ogg' }` — basta passar `audioUrl` para `transcribe-audio`
- A função `transcribe-audio` já lida com download via Z-API (headers de autenticação) e envio ao Whisper
- O `supabase` client já está instanciado no escopo do handler com `service_role`, compatível com `functions.invoke`
- Nenhuma mudança necessária no webhook nem na `transcribe-audio`

