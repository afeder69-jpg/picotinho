## Plano: Sistema de Feedback e Suporte via WhatsApp — IMPLEMENTADO

### O que foi feito

**1. Migration (banco de dados)**
- Tabela `feedbacks`: tipo (enum), status, prioridade, telefone_whatsapp, canal, session_id, atribuição
- Tabela `feedbacks_respostas`: histórico completo, autor_tipo flexível ('admin', 'master', 'sistema', 'ia', 'atendente'), controle de envio WhatsApp
- RLS para masters + service role
- Trigger de updated_at + índices

**2. Edge Function `picotinho-assistant`**
- Nova tool `registrar_feedback` (tipo, mensagem, contexto)
- Case no `executeTool` com insert em feedbacks + resposta automática da IA no histórico
- System prompt com regras de detecção de feedback (linhas 36-41)
- Prioridade automática: erros = alta, demais = normal

**3. Edge Function `responder-feedback-whatsapp` (NOVA)**
- Recebe feedback_id, mensagem, autor_id
- Envia via Z-API com prefixo "📬 Resposta do Picotinho"
- Registra no histórico com status de envio (enviado/falha)
- Só marca feedback como "respondido" se envio for bem-sucedido

**4. Painel Admin (NormalizacaoGlobal.tsx)**
- Card "Suporte" nos stats com contadores por tipo (pendentes)
- Aba "Suporte" com filtros por tipo e status
- Lista de feedbacks com badges coloridos
- Dialog de detalhe com: info do usuário, mensagem, histórico de interações, ações de status, campo de resposta via WhatsApp
