// Edge function: confirmar-convite
// Após o signUp, marca o convite reservado como 'usado', amarrando ao user.id
// Valida JWT do usuário recém-criado e bate o e-mail do JWT contra o reservado.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

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
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return jsonResponse({ ok: false, motivo: 'nao_autenticado' }, 401);
    }

    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsErr } = await supabaseAuth.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) {
      return jsonResponse({ ok: false, motivo: 'token_invalido' }, 401);
    }

    const userId = claimsData.claims.sub as string;
    const userEmail = String(claimsData.claims.email || '').toLowerCase().trim();

    const { token_temp } = await req.json().catch(() => ({}));
    if (!token_temp || typeof token_temp !== 'string') {
      return jsonResponse({ ok: false, motivo: 'token_temp_ausente' }, 400);
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: convite, error: fetchErr } = await supabaseAdmin
      .from('convites_acesso')
      .select('*')
      .eq('token_temp', token_temp)
      .maybeSingle();

    if (fetchErr) {
      console.error('[confirmar-convite] erro ao buscar:', fetchErr);
      return jsonResponse({ ok: false, motivo: 'erro_interno' }, 500);
    }

    if (!convite) {
      return jsonResponse({ ok: false, motivo: 'convite_nao_encontrado' }, 404);
    }

    if (convite.status === 'usado') {
      return jsonResponse({ ok: false, motivo: 'ja_usado' }, 409);
    }

    if (
      !convite.token_expira_em ||
      new Date(convite.token_expira_em).getTime() < Date.now()
    ) {
      return jsonResponse({ ok: false, motivo: 'token_expirado' }, 410);
    }

    // Email do JWT precisa bater com o destino reservado
    const destinoNorm = String(convite.email_destino || '').toLowerCase().trim();
    if (destinoNorm && destinoNorm !== userEmail) {
      return jsonResponse({ ok: false, motivo: 'email_nao_corresponde' }, 403);
    }

    const { error: updateErr } = await supabaseAdmin
      .from('convites_acesso')
      .update({
        status: 'usado',
        usado_por: userId,
        usado_em: new Date().toISOString(),
        token_temp: null,
        token_expira_em: null,
      })
      .eq('id', convite.id)
      .neq('status', 'usado');

    if (updateErr) {
      console.error('[confirmar-convite] erro ao confirmar:', updateErr);
      return jsonResponse({ ok: false, motivo: 'erro_interno' }, 500);
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    console.error('[confirmar-convite] erro inesperado:', err);
    return jsonResponse({ ok: false, motivo: 'erro_interno' }, 500);
  }
});
