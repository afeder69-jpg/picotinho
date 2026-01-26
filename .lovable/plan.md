
# 🔧 Correção: Race Condition no Processamento Automático de Notas

## 📋 Diagnóstico do Problema

### Sintoma Observado
- Nota fiscal do Megabox (R$81,24) com 14 itens
- Item "TEMP CARNE SAZON V 60G" (tempero de carne) não aparece no estoque
- Na verdade, **NENHUM** item da nota foi para o estoque

### Evidências no Banco
```
notas_imagens:
- processada: true ✓
- produtos_normalizados: 0 ❌
- tentativas_normalizacao: 0 ❌
- processing_started_at: null ❌

estoque_app: 0 itens para essa nota
produtos_candidatos_normalizacao: 0 candidatos
```

### Log do Console
```
📨 [REALTIME] EVENTO RECEBIDO!
🔍 [REALTIME] Verificando condições...
⚠️ [REALTIME] Nota não está mais sendo processada, ignorando evento
```

### Causa Raiz: Race Condition

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                          LINHA DO TEMPO                                  │
├─────────────────────────────────────────────────────────────────────────┤
│ T0   │ Frontend: Escaneia QR Code                                       │
│ T1   │ Frontend: Adiciona tempId ao processingNotesData                 │
│ T2   │ Frontend: Chama process-url-nota (assíncrono)                    │
│ T3   │ Backend: process-url-nota cria nota, chama process-nfce          │
│ T4   │ Backend: process-nfce consulta cache/API                         │
│ T5   │ Backend: process-nfce marca processada=true, salva dados         │
│ T6   │ Realtime: Dispara evento UPDATE para o frontend                  │
│ T7   │ Frontend: Realtime verifica processingNotesData.has(notaId)      │
│      │           → FALSE! (notaId ainda não foi adicionado)             │
│      │           → "Nota não está mais sendo processada, ignorando"     │
│ T8   │ Frontend: Recebe resposta de process-url-nota com notaId         │
│ T9   │ Frontend: Remove tempId, adiciona notaId                         │
│      │           → TARDE DEMAIS! Evento Realtime já foi ignorado        │
└─────────────────────────────────────────────────────────────────────────┘
```

O problema está no arquivo `src/components/BottomNavigation.tsx`:
- Linha 139-147: A chamada é feita com `.then()` assíncrono
- Linha 569-572: O Realtime ignora notas que não estão em `processingNotesData`

## 🎯 Solução Proposta

### Estratégia: Mudar a lógica de verificação do Realtime

Ao invés de verificar se a nota está em `processingNotesData`, verificar se a nota foi processada com sucesso checando o estoque.

### Mudanças no `BottomNavigation.tsx`

**1. Remover a verificação problemática no Realtime listener (linhas 568-572)**

Antes:
```typescript
// ✅ VALIDAÇÃO 3: Se a nota não está mais sendo processada, ignorar
if (!processingNotesData.has(notaAtualizada.id)) {
  console.log('⚠️ [REALTIME] Nota não está mais sendo processada, ignorando evento');
  return;
}
```

Depois:
```typescript
// ✅ VALIDAÇÃO 3: Se a nota já tem itens no estoque, ignorar
// (isso significa que process-receipt-full já foi executado)
const { count: estoqueCount } = await supabase
  .from('estoque_app')
  .select('id', { count: 'exact', head: true })
  .eq('nota_id', notaAtualizada.id)
  .eq('user_id', user.id);

if (estoqueCount && estoqueCount > 0) {
  console.log('⚠️ [REALTIME] Nota já tem itens no estoque, ignorando');
  return;
}
```

**2. Adicionar fallback no Realtime para notas órfãs (linhas 575-650)**

Se a nota tem `dados_extraidos` e `processada=true` mas nenhum item no estoque, processar automaticamente:

```typescript
// Verificar se a nota foi processada mas não tem itens no estoque (caso órfão)
if (notaAtualizada.processada && notaAtualizada.dados_extraidos) {
  console.log('✅ [REALTIME] Nota pronta para processamento:', notaAtualizada.id);
  
  // ... resto do código de processamento
}
```

**3. Melhorar o polling para detectar notas órfãs (novo useEffect)**

Adicionar um polling secundário que busca notas recentes (últimos 5 min) com `processada=true` mas sem itens no estoque:

```typescript
useEffect(() => {
  if (!user?.id) return;
  
  const checkOrphanNotes = async () => {
    // Buscar notas recentes que foram processadas mas não têm estoque
    const { data: orphanNotes } = await supabase
      .from('notas_imagens')
      .select('id, dados_extraidos')
      .eq('usuario_id', user.id)
      .eq('processada', true)
      .eq('normalizada', false)
      .eq('produtos_normalizados', 0)
      .gt('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString());
    
    for (const nota of orphanNotes || []) {
      // Verificar se realmente não tem estoque
      const { count } = await supabase
        .from('estoque_app')
        .select('id', { count: 'exact', head: true })
        .eq('nota_id', nota.id);
      
      if (!count || count === 0) {
        console.log('🔄 [ORPHAN] Processando nota órfã:', nota.id);
        await processarNotaAutomaticamente(nota.id, user.id, nota);
      }
    }
  };
  
  const interval = setInterval(checkOrphanNotes, 10000); // A cada 10s
  return () => clearInterval(interval);
}, [user?.id]);
```

## 📊 Resumo das Alterações

| Arquivo | Mudança | Objetivo |
|---------|---------|----------|
| `BottomNavigation.tsx` | Remover verificação `processingNotesData.has()` | Eliminar race condition |
| `BottomNavigation.tsx` | Adicionar verificação de estoque existente | Evitar reprocessamento |
| `BottomNavigation.tsx` | Adicionar polling de notas órfãs | Recuperar notas perdidas |

## 🧪 Testes Necessários

1. **Teste de nova nota**: Escanear QR Code, verificar se todos os produtos entram no estoque
2. **Teste de nota duplicada**: Escanear mesma nota duas vezes, verificar que não duplica
3. **Teste de nota órfã**: A nota do Megabox deve ser processada automaticamente pelo polling

## ⚡ Solução Imediata (para a nota atual)

Enquanto a correção não é implementada, podemos chamar `process-receipt-full` manualmente para a nota órfã do Megabox:

```sql
-- Verificar nota
SELECT id, processada, produtos_normalizados FROM notas_imagens 
WHERE id = '933ed06e-53af-40bd-8835-8dc74f6ae97f';

-- A edge function pode ser chamada via curl/fetch com:
-- notaId: '933ed06e-53af-40bd-8835-8dc74f6ae97f'
-- userId: 'ae5b5501-7f8a-46da-9cba-b9955a84e697'
```
