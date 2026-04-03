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

---

## Plano: Comunicação Ativa via WhatsApp pelo Master — IMPLEMENTADO

### O que foi feito

**1. Migration (banco de dados)**
- Tabela `campanhas_whatsapp`: titulo, mensagem, filtro_tipo/filtro_valor, contadores (total_destinatarios, total_enviados, total_falhas), status (rascunho/enviando/concluida/concluida_parcial/falha), criado_por, timestamps
- Tabela `campanhas_whatsapp_envios`: log por destinatário com UNIQUE(campanha_id, user_id) para idempotência. RLS: SELECT apenas para masters
- Tabela `campanhas_whatsapp_respostas`: preparada para respostas futuras com cidade, estado, contexto (jsonb), processada
- Coluna `profiles.estado` + índices em estado e cidade
- RLS restritiva: apenas masters via has_role (sem policy permissiva ampla)

**2. Edge Function `enviar-campanha-whatsapp` (NOVA)**
- Segurança: JWT obrigatório + validação de role master com revogado_em IS NULL
- Três actions protegidas: `preview`, `filtros`, `enviar`
- Critério de usuário ativo: JOIN whatsapp_telefones_autorizados (verificado=true, ativo=true) com profiles
- Telefone determinístico: DISTINCT por usuario_id, mais recente por created_at da tabela whatsapp_telefones_autorizados
- Preview e disparo usam exatamente a mesma query (função queryDestinatarios compartilhada)
- Envio em lotes de 10 com pausa de 2s via Z-API, prefixo 📢 *Picotinho*
- Reprocessamento: apenas status IN ('pendente', 'falha'), ON CONFLICT DO NOTHING
- Contadores recalculados com COUNT real por status (não incrementais)
- Status final: concluida (0 falhas) / concluida_parcial (mix) / falha (0 enviados)

**3. Painel Admin (NormalizacaoGlobal.tsx) — Nova aba "Campanhas"**
- Cards resumo: total, concluídas, em andamento
- Botão "Nova Campanha" com Dialog: título, mensagem (textarea), público (RadioGroup: Todos/Estado/Cidade), dropdown dinâmico, preview de destinatários em tempo real
- AlertDialog de confirmação antes do envio
- Lista de campanhas com badges coloridos por status
- Dialog de detalhe com: mensagem, critério de disparo auditável, lista de envios individuais com status
- Botão "Reprocessar" para campanhas com status falha ou concluida_parcial
- Integrado ao auto-refresh de 30s via carregarCampanhas()
