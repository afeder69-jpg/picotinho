// Edge function: liberar-convite
// Libera um convite que ficou em status 'reservado' (ex: signUp falhou após reserva).
// Só atua se status='reservado' E token_temp bater exatamente.
// NUNCA libera convites com status 'usado' ou 'cancelado'.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 10;
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
      return jsonResponse({ ok: false, motivo: 'rate_limit' }, 429);
    }

    const { token_temp } = await req.json().catch(() => ({}));
    if (!token_temp || typeof token_temp !== 'string') {
      return jsonResponse({ ok: false, motivo: 'token_temp_ausente' }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Atualiza atomicamente: só libera se ainda estiver reservado E token_temp bater.
    // Nunca toca em 'usado' nem 'cancelado'.
    const { data, error } = await supabase
      .from('convites_acesso')
      .update({
        status: 'disponivel',
        token_temp: null,
        token_expira_em: null,
      })
      .eq('token_temp', token_temp)
      .eq('status', 'reservado')
      .select('id, codigo');

    if (error) {
      console.error('[liberar-convite] erro ao liberar:', error);
      return jsonResponse({ ok: false, motivo: 'erro_interno' }, 500);
    }

    if (!data || data.length === 0) {
      return jsonResponse({ ok: false, motivo: 'nao_aplicavel' }, 404);
    }

    return jsonResponse({ ok: true, codigo: data[0].codigo });
  } catch (err) {
    console.error('[liberar-convite] erro inesperado:', err);
    return jsonResponse({ ok: false, motivo: 'erro_interno' }, 500);
  }
});
