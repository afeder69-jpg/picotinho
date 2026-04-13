

## Plano: Normalizar campos de telefone — assumir Brasil (55)

### Status: ✅ Implementado

### Resumo
O usuário passa a digitar apenas DDD + número (11 dígitos). O sistema adiciona `55` automaticamente. Exibição amigável `(XX) XXXXX-XXXX`. Armazenamento interno mantém 13 dígitos com `55`. Z-API sempre recebe com `55`.

### Arquivos alterados
- **Novo**: `src/lib/telefone.ts` — funções utilitárias centralizadas (normalizar, validar, formatar, comparar, erros amigáveis)
- **Migration SQL**: triggers `trg_normalizar_telefone` e `trg_normalizar_telefone_config` + função `normalizar_telefone_br()` com `search_path` seguro
- `src/pages/WhatsAppConfig.tsx` — inputs sem exigir 55, validação amigável, formatação centralizada
- `src/components/listaCompras/SeletorTelefoneWhatsApp.tsx` — formatação centralizada
- `supabase/functions/enviar-codigo-verificacao/index.ts` — aceita 11 ou 13 dígitos, envia COM 55
- `supabase/functions/enviar-pdf-whatsapp/index.ts` — simplificado, confia no trigger do banco
- `supabase/functions/enviar-lista-whatsapp/index.ts` — simplificado, confia no trigger do banco

### Contrato Z-API unificado
Todas as funções enviam para Z-API com `55` (13 dígitos). Sem exceção.
