import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // ===== VALIDAÇÃO JWT + ROLE MASTER =====
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Token de autorização ausente' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await userClient.auth.getUser(token);
    if (claimsError || !claimsData?.user) {
      return new Response(JSON.stringify({ error: 'Token inválido' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const userId = claimsData.user.id;

    // Verificar role master com revogado_em IS NULL
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data: roleData } = await serviceClient
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'master')
      .is('revogado_em', null)
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: 'Acesso restrito a masters' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { action, campanha_id, titulo, mensagem, filtro_tipo, filtro_valor } = await req.json();

    // ===== QUERY DE DESTINATÁRIOS (compartilhada entre preview e envio) =====
    async function queryDestinatarios(fTipo: string, fValor: string | null) {
      let baseQuery = serviceClient
        .from('whatsapp_telefones_autorizados')
        .select('usuario_id, numero_whatsapp, created_at')
        .eq('verificado', true)
        .eq('ativo', true)
        .order('created_at', { ascending: false });

      const { data: telefones, error: telError } = await baseQuery;
      if (telError) {
        console.error('❌ [CAMPANHA] Erro ao buscar telefones autorizados:', JSON.stringify(telError));
        throw new Error(`Erro ao buscar destinatários: ${telError.message}`);
      }

      // Deduplicate by usuario_id (keep most recent)
      const seen = new Map<string, any>();
      for (const t of (telefones || [])) {
        if (!seen.has(t.usuario_id)) {
          seen.set(t.usuario_id, t);
        }
      }

      const userIds = Array.from(seen.keys());
      if (userIds.length === 0) return [];

      const { data: profiles, error: profError } = await serviceClient
        .from('profiles')
        .select('user_id, cidade, estado')
        .in('user_id', userIds);

      if (profError) {
        console.error('❌ [CAMPANHA] Erro ao buscar profiles:', JSON.stringify(profError));
        throw new Error(`Erro ao buscar profiles: ${profError.message}`);
      }

      const profileMap = new Map((profiles || []).map(p => [p.user_id, p]));

      const result = [];
      for (const [uid, tel] of seen) {
        const profile = profileMap.get(uid);
        if (fTipo === 'estado' && fValor && profile?.estado !== fValor) continue;
        if (fTipo === 'cidade' && fValor && profile?.cidade !== fValor) continue;

        result.push({
          user_id: uid,
          telefone: tel.numero_whatsapp,
          cidade: profile?.cidade || null,
          estado: profile?.estado || null,
        });
      }

      return result;
    }

    // ===== ACTION: PREVIEW =====
    if (action === 'preview') {
      const destinatarios = await queryDestinatarios(filtro_tipo || 'todos', filtro_valor || null);
      return new Response(JSON.stringify({ 
        total: destinatarios.length,
        criterio: {
          filtro_tipo: filtro_tipo || 'todos',
          filtro_valor: filtro_valor || null,
          descricao: `Telefones autorizados (verificado=true, ativo=true) com DISTINCT ON (usuario_id) ORDER BY created_at DESC`
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ===== ACTION: FILTROS DISPONÍVEIS =====
    if (action === 'filtros') {
      const { data: estados } = await serviceClient
        .from('profiles')
        .select('estado')
        .not('estado', 'is', null)
        .neq('estado', '');

      const { data: cidades } = await serviceClient
        .from('profiles')
        .select('cidade')
        .not('cidade', 'is', null)
        .neq('cidade', '');

      const estadosUnicos = [...new Set((estados || []).map(e => e.estado).filter(Boolean))].sort();
      const cidadesUnicas = [...new Set((cidades || []).map(c => c.cidade).filter(Boolean))].sort();

      return new Response(JSON.stringify({ estados: estadosUnicos, cidades: cidadesUnicas }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ===== ACTION: ENVIAR =====
    if (action !== 'enviar') {
      return new Response(JSON.stringify({ error: 'Action inválida. Use: preview, filtros ou enviar' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!campanha_id) {
      return new Response(JSON.stringify({ error: 'campanha_id é obrigatório' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Buscar campanha
    const { data: campanha, error: campError } = await serviceClient
      .from('campanhas_whatsapp')
      .select('*')
      .eq('id', campanha_id)
      .single();

    if (campError || !campanha) {
      return new Response(JSON.stringify({ error: 'Campanha não encontrada' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Verificar status permitido para envio/reprocessamento
    if (!['rascunho', 'falha', 'concluida_parcial'].includes(campanha.status)) {
      return new Response(JSON.stringify({ error: `Status '${campanha.status}' não permite envio. Apenas rascunho, falha ou concluida_parcial.` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Marcar como enviando
    await serviceClient
      .from('campanhas_whatsapp')
      .update({ status: 'enviando', iniciada_em: new Date().toISOString() })
      .eq('id', campanha_id);

    console.log(`📢 [CAMPANHA] Iniciando envio: ${campanha.titulo} (${campanha_id})`);

    try {
      // Consultar destinatários
      const destinatarios = await queryDestinatarios(campanha.filtro_tipo, campanha.filtro_valor);
      
      console.log(`📢 [CAMPANHA] ${destinatarios.length} destinatários encontrados`);

      await serviceClient
        .from('campanhas_whatsapp')
        .update({ total_destinatarios: destinatarios.length })
        .eq('id', campanha_id);

      // INSERT envios com ON CONFLICT DO NOTHING
      if (destinatarios.length > 0) {
        const enviosInsert = destinatarios.map((d: any) => ({
          campanha_id,
          user_id: d.user_id,
          telefone: d.telefone,
          status: 'pendente'
        }));

        for (let i = 0; i < enviosInsert.length; i += 100) {
          const batch = enviosInsert.slice(i, i + 100);
          await serviceClient
            .from('campanhas_whatsapp_envios')
            .upsert(batch, { onConflict: 'campanha_id,user_id', ignoreDuplicates: true });
        }
      }

      // SELECT apenas envios pendentes ou com falha
      const { data: enviosPendentes } = await serviceClient
        .from('campanhas_whatsapp_envios')
        .select('*')
        .eq('campanha_id', campanha_id)
        .in('status', ['pendente', 'falha']);

      if (!enviosPendentes || enviosPendentes.length === 0) {
        await recalcularContadores(serviceClient, campanha_id);
        return new Response(JSON.stringify({ ok: true, message: 'Nenhum envio pendente' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Credenciais Z-API
      const instanceUrl = Deno.env.get('WHATSAPP_INSTANCE_URL');
      const apiToken = Deno.env.get('WHATSAPP_API_TOKEN');
      const accountSecret = Deno.env.get('WHATSAPP_ACCOUNT_SECRET');

      if (!instanceUrl || !apiToken) {
        await serviceClient
          .from('campanhas_whatsapp')
          .update({ status: 'falha' })
          .eq('id', campanha_id);
        return new Response(JSON.stringify({ error: 'Credenciais WhatsApp não configuradas' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const sendTextUrl = `${instanceUrl}/token/${apiToken}/send-text`;
      const prefixo = `📢 *Picotinho*\n\n`;

      // Enviar em lotes de 10 com pausa de 2s
      for (let i = 0; i < enviosPendentes.length; i += 10) {
        const lote = enviosPendentes.slice(i, i + 10);

        await Promise.all(lote.map(async (envio) => {
          try {
            const response = await fetch(sendTextUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(accountSecret ? { 'Client-Token': accountSecret } : {})
              },
              body: JSON.stringify({
                phone: envio.telefone,
                message: prefixo + campanha.mensagem,
                delayTyping: 3
              })
            });

            if (response.ok) {
              await serviceClient
                .from('campanhas_whatsapp_envios')
                .update({ status: 'enviado', enviado_em: new Date().toISOString(), erro: null })
                .eq('id', envio.id);
              console.log(`✅ [CAMPANHA] Enviado para ${envio.telefone}`);
            } else {
              const errBody = await response.text();
              await serviceClient
                .from('campanhas_whatsapp_envios')
                .update({ status: 'falha', erro: `HTTP ${response.status}: ${errBody}` })
                .eq('id', envio.id);
              console.error(`❌ [CAMPANHA] Falha ${envio.telefone}: HTTP ${response.status}`);
            }
          } catch (err: any) {
            await serviceClient
              .from('campanhas_whatsapp_envios')
              .update({ status: 'falha', erro: err.message })
              .eq('id', envio.id);
            console.error(`❌ [CAMPANHA] Exceção ${envio.telefone}: ${err.message}`);
          }
        }));

        if (i + 10 < enviosPendentes.length) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      // Recalcular contadores
      await recalcularContadores(serviceClient, campanha_id);

      console.log(`📢 [CAMPANHA] Envio concluído: ${campanha.titulo}`);

      return new Response(JSON.stringify({ ok: true, total_processados: enviosPendentes.length }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (envioErr: any) {
      console.error(`❌ [CAMPANHA] Exceção fatal após marcar como enviando (${campanha_id}):`, envioErr.message);
      await serviceClient
        .from('campanhas_whatsapp')
        .update({ status: 'falha', concluida_em: new Date().toISOString() })
        .eq('id', campanha_id);
      throw envioErr;
    }

  } catch (error: any) {
    console.error('❌ [CAMPANHA] Erro:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

// Recalcula contadores usando COUNT real por status (não incremental)
async function recalcularContadores(client: any, campanhaId: string) {
  const { data: contagem } = await client
    .from('campanhas_whatsapp_envios')
    .select('status')
    .eq('campanha_id', campanhaId);

  const enviados = (contagem || []).filter((e: any) => e.status === 'enviado').length;
  const falhas = (contagem || []).filter((e: any) => e.status === 'falha').length;
  const total = (contagem || []).length;

  let statusFinal: string;
  if (total === 0) {
    statusFinal = 'falha';
  } else if (falhas === 0) {
    statusFinal = 'concluida';
  } else if (enviados === 0) {
    statusFinal = 'falha';
  } else {
    statusFinal = 'concluida_parcial';
  }

  await client
    .from('campanhas_whatsapp')
    .update({
      total_enviados: enviados,
      total_falhas: falhas,
      total_destinatarios: total,
      status: statusFinal,
      concluida_em: new Date().toISOString()
    })
    .eq('id', campanhaId);
}
