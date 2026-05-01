// Edge function: consumir-convite
// Reserva um código de convite e devolve um token temporário (10 min)
// que o frontend usa logo após o signUp para confirmar via confirmar-convite.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Rate limit em memória (por instância) — ad-hoc, sem infra dedicada
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60_000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || entry.resetAt < now) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  entry.count += 1;
  return entry.count <= RATE_LIMIT_MAX;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      req.headers.get('cf-connecting-ip') ||
      'unknown';

    if (!checkRateLimit(ip)) {
      return jsonResponse(
        { ok: false, motivo: 'rate_limit', mensagem: 'Muitas tentativas. Aguarde alguns instantes.' },
        429,
      );
    }

    const { codigo, email } = await req.json().catch(() => ({}));

    // Validação de formato
    const codigoNorm = typeof codigo === 'string' ? codigo.toUpperCase().trim() : '';
    const emailNorm = typeof email === 'string' ? email.toLowerCase().trim() : '';

    if (!/^[A-Z0-9]{8}$/.test(codigoNorm)) {
      return jsonResponse(
        { ok: false, motivo: 'formato_invalido', mensagem: 'Código deve ter 8 caracteres (letras maiúsculas e números).' },
        400,
      );
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm) || emailNorm.length > 255) {
      return jsonResponse(
        { ok: false, motivo: 'email_invalido', mensagem: 'Informe um e-mail válido.' },
        400,
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: convite, error: fetchErr } = await supabase
      .from('convites_acesso')
      .select('*')
      .eq('codigo', codigoNorm)
      .maybeSingle();

    if (fetchErr) {
      console.error('[consumir-convite] erro ao buscar convite:', fetchErr);
      return jsonResponse({ ok: false, motivo: 'erro_interno', mensagem: 'Erro ao validar convite.' }, 500);
    }

    if (!convite) {
      return jsonResponse({ ok: false, motivo: 'inexistente', mensagem: 'Código de convite não encontrado.' }, 404);
    }

    if (convite.status === 'usado') {
      return jsonResponse({ ok: false, motivo: 'usado', mensagem: 'Este código já foi utilizado.' }, 409);
    }

    if (convite.status === 'cancelado') {
      return jsonResponse({ ok: false, motivo: 'cancelado', mensagem: 'Este código de convite foi cancelado.' }, 409);
    }

    if (convite.expira_em && new Date(convite.expira_em).getTime() < Date.now()) {
      return jsonResponse({ ok: false, motivo: 'expirado', mensagem: 'Este código de convite expirou.' }, 410);
    }

    // Reserva ainda válida por outra pessoa
    if (
      convite.status === 'reservado' &&
      convite.token_expira_em &&
      new Date(convite.token_expira_em).getTime() > Date.now()
    ) {
      return jsonResponse(
        { ok: false, motivo: 'reservado', mensagem: 'Este código está em uso. Tente novamente em alguns minutos.' },
        409,
      );
    }

    // Email amarrado: se houver email_destino definido, precisa bater
    if (convite.email_destino) {
      const destinoNorm = String(convite.email_destino).toLowerCase().trim();
      if (destinoNorm !== emailNorm) {
        return jsonResponse(
          { ok: false, motivo: 'email_nao_corresponde', mensagem: 'Este código foi gerado para outro e-mail.' },
          403,
        );
      }
    }

    // Reservar: gera token temporário válido por 10 minutos
    const tokenTemp = crypto.randomUUID();
    const tokenExpiraEm = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { error: updateErr } = await supabase
      .from('convites_acesso')
      .update({
        status: 'reservado',
        token_temp: tokenTemp,
        token_expira_em: tokenExpiraEm,
        email_destino: convite.email_destino ?? emailNorm,
      })
      .eq('id', convite.id)
      // proteção contra corrida: só aceita se ainda não foi marcado como usado/cancelado
      .not('status', 'in', '(usado,cancelado)');

    if (updateErr) {
      console.error('[consumir-convite] erro ao reservar:', updateErr);
      return jsonResponse({ ok: false, motivo: 'erro_interno', mensagem: 'Não foi possível reservar o convite.' }, 500);
    }

    return jsonResponse({
      ok: true,
      token_temp: tokenTemp,
      token_expira_em: tokenExpiraEm,
      mensagem: 'Convite válido. Prossiga com o cadastro.',
    });
  } catch (err) {
    console.error('[consumir-convite] erro inesperado:', err);
    return jsonResponse({ ok: false, motivo: 'erro_interno', mensagem: 'Erro inesperado.' }, 500);
  }
});
