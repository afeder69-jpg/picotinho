

## Diagnostico: Campanha enviada sem audio

### Causa raiz

No log da campanha: `🔊 [CAMPANHA] Preferências: 3 texto, 0 com áudio`

Os dois usuarios com `modo_resposta = 'ambos'` nao foram identificados porque a query na linha 556 do `enviar-campanha-whatsapp/index.ts` usa `.in('user_id', batchIds)`, mas a coluna real na tabela `whatsapp_preferencias_usuario` se chama **`usuario_id`**.

A query retorna zero resultados sem erro (Supabase ignora coluna inexistente no filtro `.in()`), entao todos caem no default `'texto'`.

### Correcao

**Arquivo unico: `supabase/functions/enviar-campanha-whatsapp/index.ts`**

Linha 553-556 — trocar:
```typescript
.select('user_id, modo_resposta')
.in('user_id', batchIds);
```
por:
```typescript
.select('usuario_id, modo_resposta')
.in('usuario_id', batchIds);
```

Linha 559 — trocar:
```typescript
preferenciaMap.set(p.user_id, p.modo_resposta);
```
por:
```typescript
preferenciaMap.set(p.usuario_id, p.modo_resposta);
```

### O que NAO muda

- Toda a logica de TTS, envio de audio, fallback, lotes, contadores
- Fluxo de edicao, exclusao, reenvio
- Restante do assistente e demais edge functions

### Validacao pos-deploy

- Reenviar a mesma campanha
- Logs devem mostrar `Preferências: X texto, Y com áudio` com Y > 0
- Usuarios com `modo_resposta = 'ambos'` devem receber texto + audio

