// Edge function: toggle-acesso-restrito
// - Requer JWT do master
// - Reautentica com senha
// - Atualiza public.app_config (chave = 'acesso_restrito')
// - Grava log em public.acesso_restrito_log

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0';
import { requireMaster, authErrorResponse, corsHeaders } from '../_shared/auth.ts';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const ctx = await requireMaster(req);

    const body = await req.json().catch(() => ({}));
    const novoValor = body?.novo_valor;
    const senha = body?.senha;

    if (typeof novoValor !== 'boolean') {
      return jsonResponse({ ok: false, motivo: 'novo_valor_invalido' }, 400);
    }
    if (!senha || typeof senha !== 'string') {
      return jsonResponse({ ok: false, motivo: 'senha_obrigatoria' }, 400);
    }
    if (!ctx.email) {
      return jsonResponse({ ok: false, motivo: 'email_indisponivel' }, 400);
    }

    // Reautentica com senha (cliente anônimo isolado)
    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
    );
    const { error: signInErr } = await anonClient.auth.signInWithPassword({
      email: ctx.email,
      password: senha,
    });
    if (signInErr) {
      console.warn('[toggle-acesso-restrito] senha inválida para', ctx.email);
      return jsonResponse({ ok: false, motivo: 'senha_invalida' }, 401);
    }

    // Lê valor atual
    const { data: atual, error: readErr } = await ctx.admin
      .from('app_config')
      .select('valor')
      .eq('chave', 'acesso_restrito')
      .maybeSingle();

    if (readErr) {
      console.error('[toggle-acesso-restrito] erro ao ler app_config:', readErr);
      return jsonResponse({ ok: false, motivo: 'erro_interno' }, 500);
    }

    const valorAnterior = atual?.valor === true || (atual?.valor as any) === 'true';

    if (valorAnterior === novoValor) {
      return jsonResponse({ ok: true, valor_atual: novoValor, sem_alteracao: true });
    }

    // Atualiza
    const { error: updErr } = await ctx.admin
      .from('app_config')
      .update({ valor: novoValor as any })
      .eq('chave', 'acesso_restrito');

    if (updErr) {
      console.error('[toggle-acesso-restrito] erro ao atualizar:', updErr);
      return jsonResponse({ ok: false, motivo: 'erro_interno' }, 500);
    }

    // Log (best-effort)
    const { error: logErr } = await ctx.admin
      .from('acesso_restrito_log')
      .insert({
        alterado_por: ctx.userId,
        email: ctx.email,
        valor_anterior: valorAnterior,
        valor_novo: novoValor,
      });
    if (logErr) console.warn('[toggle-acesso-restrito] log falhou:', logErr);

    return jsonResponse({ ok: true, valor_atual: novoValor });
  } catch (err) {
    return authErrorResponse(err);
  }
});
