/**
 * Tratamento centralizado de erros dos fluxos de telefone/WhatsApp.
 *
 * Garante que o usuário NUNCA veja mensagem técnica, genérica ou em inglês.
 * O erro técnico completo é mantido nos logs internos (console.error) para diagnóstico.
 */

// Padrões técnicos mapeados para mensagens amigáveis em português.
// A ordem importa: padrões mais específicos devem vir antes dos genéricos.
const MAPEAMENTO_ERROS: Array<{ padrao: RegExp; mensagem: string }> = [
  // Unicidade / conflito de banco
  {
    padrao: /23505|duplicate key|unique constraint|unique_violation/i,
    mensagem: "Este número de WhatsApp já está em uso. Verifique e tente novamente.",
  },
  // Cross-user: número ativo em outra conta
  {
    padrao: /vinculado a outra conta|pertence a outro usu[aá]rio|another account/i,
    mensagem: "Este número de WhatsApp já está vinculado a outra conta.",
  },
  // Número já cadastrado na própria conta
  {
    padrao: /j[aá] (foi |est[aá] )?cadastrad/i,
    mensagem: "Este número já foi cadastrado nesta conta.",
  },
  // DDD inválido — padrão restrito para evitar falso positivo
  {
    padrao: /\bDDD\b.*inv[aá]lid|inv[aá]lid.*\bDDD\b/i,
    mensagem: "O DDD informado não é válido. Verifique o número e tente novamente.",
  },
  // Número inválido
  {
    padrao: /n[uú]mero inv[aá]lid|invalid.*(number|phone|celular)|celular.*inv[aá]lid/i,
    mensagem: "Digite um número de celular válido com DDD.",
  },
  // Aguardando verificação / processo pendente
  {
    padrao: /processo de verifica[cç][aã]o|aguardando verifica|pendente.*verifica|verifica.*pendente/i,
    mensagem: "Este número já está em processo de verificação. Aguarde alguns minutos e tente novamente.",
  },
  // Código expirado
  {
    padrao: /expir(ou|ado|ed)|c[oó]digo.*expir/i,
    mensagem: "O código expirou. Solicite um novo código para continuar.",
  },
  // Código incorreto / inválido
  {
    padrao: /c[oó]digo.*(incorreto|inv[aá]lid)|incorrect.*code|invalid.*code/i,
    mensagem: "O código informado é inválido. Verifique e tente novamente.",
  },
  // Limite de telefones
  {
    padrao: /m[aá]ximo|limite.*telefon|telefon.*limite/i,
    mensagem: "Você já possui o máximo de 3 telefones autorizados. Remova um para adicionar outro.",
  },
  // Sessão expirada / não autenticado
  {
    padrao: /not authenticated|authorization|sess[aã]o.*expir|n[aã]o autenticad/i,
    mensagem: "Sua sessão expirou. Faça login novamente.",
  },
  // WhatsApp não configurado / falha de envio
  {
    padrao: /n[aã]o configurad|whatsapp.*n[aã]o config|falha.*(envio|enviar)|failed.*send/i,
    mensagem: "Não foi possível enviar o código agora. Tente novamente em instantes.",
  },
  // Erro genérico de edge function / HTTP / rede
  {
    padrao: /non-2xx|status code|fetch failed|network|edge function|ECONNREFUSED/i,
    mensagem: "Não foi possível concluir essa ação agora. Tente novamente em instantes.",
  },
];

const FALLBACK_GENERICO = "Não foi possível concluir essa ação agora. Tente novamente em instantes.";

/**
 * Verifica se a mensagem parece ser de negócio (em português, clara).
 * Mensagens de negócio do backend têm prioridade e são exibidas diretamente.
 */
function ehMensagemDeNegocio(msg: string): boolean {
  if (!msg || msg.length < 5) return false;

  // Se contém termos claramente técnicos, não é mensagem de negócio
  const padroesTecnicos = /non-2xx|status code|edge function|ECONNREFUSED|fetch failed|stack trace|TypeError|ReferenceError|SyntaxError|undefined is not|cannot read prop/i;
  if (padroesTecnicos.test(msg)) return false;

  // Se está em português (contém acentuação ou palavras comuns em PT-BR), aceitar
  const indicadoresPtBr = /[àáâãéêíóôõúçÀÁÂÃÉÊÍÓÔÕÚÇ]|número|código|telefone|verificar|enviar|cadastr|tente novamente|não foi possível/i;
  if (indicadoresPtBr.test(msg)) return true;

  return false;
}

/**
 * Aplica o mapeamento de padrões para converter uma mensagem técnica
 * em uma mensagem amigável em português.
 */
function mapearParaAmigavel(texto: string): string {
  for (const { padrao, mensagem } of MAPEAMENTO_ERROS) {
    if (padrao.test(texto)) {
      return mensagem;
    }
  }
  return FALLBACK_GENERICO;
}

/**
 * Extrai uma mensagem amigável em português de qualquer erro dos fluxos de
 * telefone/WhatsApp. Função assíncrona porque `FunctionsHttpError` expõe o
 * corpo da resposta via `error.context.json()` (Promise).
 *
 * Prioridade:
 * 1. Mensagem de negócio retornada pelo backend (JSON do corpo da resposta)
 * 2. Mapeamento de padrões técnicos → mensagem amigável
 * 3. Fallback genérico em português
 *
 * O erro técnico completo permanece nos logs internos via console.error
 * no ponto de chamada.
 */
export async function extrairErroWhatsApp(error: unknown): Promise<string> {
  // 1. Tentar extrair corpo JSON da resposta (FunctionsHttpError)
  try {
    const err = error as any;
    if (err?.context?.json && typeof err.context.json === "function") {
      const body = await err.context.json();
      const msgBackend = body?.error || body?.message || "";

      if (typeof msgBackend === "string" && ehMensagemDeNegocio(msgBackend)) {
        return msgBackend;
      }

      // Corpo extraído mas não é mensagem de negócio → mapear
      if (typeof msgBackend === "string" && msgBackend.length > 0) {
        return mapearParaAmigavel(msgBackend);
      }
    }
  } catch {
    // Falha ao extrair JSON — continuar para próximas tentativas
  }

  // 2. Tentar usar error.message diretamente
  try {
    const err = error as any;
    const msg = err?.message || "";
    if (typeof msg === "string" && msg.length > 0) {
      if (ehMensagemDeNegocio(msg)) {
        return msg;
      }
      return mapearParaAmigavel(msg);
    }
  } catch {
    // Sem message acessível
  }

  // 3. Fallback genérico
  return FALLBACK_GENERICO;
}
