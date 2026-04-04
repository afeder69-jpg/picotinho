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

    const body = await req.json();
    const { action, campanha_id, titulo, mensagem, filtro_tipo, filtro_valor } = body;

    // ===== QUERY DE DESTINATÁRIOS =====
    async function queryDestinatarios(fTipo: string, fValor: string | null) {
      const { data: telefones, error: telError } = await serviceClient
        .from('whatsapp_telefones_autorizados')
        .select('usuario_id, numero_whatsapp, created_at')
        .eq('verificado', true)
        .eq('ativo', true)
        .order('created_at', { ascending: false });

      if (telError) {
        console.error('❌ [CAMPANHA] Erro ao buscar telefones autorizados:', JSON.stringify(telError));
        throw new Error(`Erro ao buscar destinatários: ${telError.message}`);
      }

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
          numero_whatsapp: tel.numero_whatsapp,
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

    // ===== ACTION: EDITAR =====
    if (action === 'editar') {
      if (!campanha_id) {
        return new Response(JSON.stringify({ error: 'campanha_id é obrigatório' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { data: campanha } = await serviceClient
        .from('campanhas_whatsapp')
        .select('status')
        .eq('id', campanha_id)
        .single();

      if (!campanha) {
        return new Response(JSON.stringify({ error: 'Campanha não encontrada' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (campanha.status === 'enviando') {
        return new Response(JSON.stringify({ error: 'Não é possível editar uma campanha em envio' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const updateFields: any = {};
      if (titulo !== undefined) updateFields.titulo = titulo;
      if (mensagem !== undefined) updateFields.mensagem = mensagem;
      if (filtro_tipo !== undefined) updateFields.filtro_tipo = filtro_tipo;
      if (filtro_valor !== undefined) updateFields.filtro_valor = filtro_valor || null;
      updateFields.updated_at = new Date().toISOString();

      await serviceClient
        .from('campanhas_whatsapp')
        .update(updateFields)
        .eq('id', campanha_id);

      console.log(`✏️ [CAMPANHA] Editada: ${campanha_id}`);

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ===== ACTION: EXCLUIR =====
    if (action === 'excluir') {
      if (!campanha_id) {
        return new Response(JSON.stringify({ error: 'campanha_id é obrigatório' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { data: campanha } = await serviceClient
        .from('campanhas_whatsapp')
        .select('status')
        .eq('id', campanha_id)
        .single();

      if (!campanha) {
        return new Response(JSON.stringify({ error: 'Campanha não encontrada' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (campanha.status === 'enviando') {
        return new Response(JSON.stringify({ error: 'Não é possível excluir uma campanha em envio' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // CASCADE cuida de disparos; deletar envios explicitamente
      await serviceClient
        .from('campanhas_whatsapp_envios')
        .delete()
        .eq('campanha_id', campanha_id);

      await serviceClient
        .from('campanhas_whatsapp')
        .delete()
        .eq('id', campanha_id);

      console.log(`🗑️ [CAMPANHA] Excluída: ${campanha_id}`);

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ===== ACTION: REENVIAR =====
    if (action === 'reenviar') {
      if (!campanha_id) {
        return new Response(JSON.stringify({ error: 'campanha_id é obrigatório' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { data: campanha, error: campError } = await serviceClient
        .from('campanhas_whatsapp')
        .select('*')
        .eq('id', campanha_id)
        .single();

      if (campError || !campanha) {
        return new Response(JSON.stringify({ error: 'Campanha não encontrada' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (!['concluida', 'concluida_parcial', 'falha'].includes(campanha.status)) {
        return new Response(JSON.stringify({ error: `Status '${campanha.status}' não permite reenvio` }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Deletar apenas envios operacionais (NÃO o histórico de disparos)
      await serviceClient
        .from('campanhas_whatsapp_envios')
        .delete()
        .eq('campanha_id', campanha_id);

      // Incrementar total_reenvios e resetar contadores
      await serviceClient
        .from('campanhas_whatsapp')
        .update({
          total_reenvios: (campanha.total_reenvios || 0) + 1,
          status: 'enviando',
          total_enviados: 0,
          total_falhas: 0,
          total_destinatarios: 0,
          iniciada_em: new Date().toISOString(),
          concluida_em: null,
        })
        .eq('id', campanha_id);

      console.log(`🔄 [CAMPANHA] Reenvio #${(campanha.total_reenvios || 0) + 1}: ${campanha.titulo} (${campanha_id})`);

      // Criar registro de disparo
      const { data: disparo } = await serviceClient
        .from('campanhas_whatsapp_disparos')
        .insert({
          campanha_id,
          iniciado_em: new Date().toISOString(),
          status: 'enviando'
        })
        .select()
        .single();

      const disparoId = disparo?.id;

      // Executar envio
      try {
        const resultado = await executarEnvio(serviceClient, campanha_id, campanha);
        await finalizarDisparo(serviceClient, campanha_id, disparoId);
        return new Response(JSON.stringify({ ok: true, total_processados: resultado }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (envioErr: any) {
        console.error(`❌ [CAMPANHA] Falha no reenvio (${campanha_id}):`, envioErr.message);
        await serviceClient.from('campanhas_whatsapp').update({ status: 'falha', concluida_em: new Date().toISOString() }).eq('id', campanha_id);
        if (disparoId) {
          await serviceClient.from('campanhas_whatsapp_disparos').update({ status: 'falha', concluido_em: new Date().toISOString() }).eq('id', disparoId);
        }
        throw envioErr;
      }
    }

    // ===== ACTION: ENVIAR =====
    if (action !== 'enviar') {
      return new Response(JSON.stringify({ error: 'Action inválida. Use: preview, filtros, editar, excluir, reenviar ou enviar' }), {
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

    // Criar registro de disparo
    const { data: disparo } = await serviceClient
      .from('campanhas_whatsapp_disparos')
      .insert({
        campanha_id,
        iniciado_em: new Date().toISOString(),
        status: 'enviando'
      })
      .select()
      .single();

    const disparoId = disparo?.id;

    try {
      const totalProcessados = await executarEnvio(serviceClient, campanha_id, campanha);
      await finalizarDisparo(serviceClient, campanha_id, disparoId);

      console.log(`📢 [CAMPANHA] Envio concluído: ${campanha.titulo}`);

      return new Response(JSON.stringify({ ok: true, total_processados: totalProcessados }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (envioErr: any) {
      console.error(`❌ [CAMPANHA] Exceção fatal após marcar como enviando (${campanha_id}):`, envioErr.message);
      await serviceClient.from('campanhas_whatsapp').update({ status: 'falha', concluida_em: new Date().toISOString() }).eq('id', campanha_id);
      if (disparoId) {
        await serviceClient.from('campanhas_whatsapp_disparos').update({ status: 'falha', concluido_em: new Date().toISOString() }).eq('id', disparoId);
      }
      throw envioErr;
    }

    // ===== FUNÇÃO DE ENVIO COMPARTILHADA =====
    async function executarEnvio(client: any, campanhaId: string, campanhaData: any): Promise<number> {
      const destinatarios = await queryDestinatarios(campanhaData.filtro_tipo, campanhaData.filtro_valor);
      
      console.log(`📢 [CAMPANHA] ${destinatarios.length} destinatários encontrados`);

      await client
        .from('campanhas_whatsapp')
        .update({ total_destinatarios: destinatarios.length })
        .eq('id', campanhaId);

      if (destinatarios.length > 0) {
        const enviosInsert = destinatarios.map((d: any) => ({
          campanha_id: campanhaId,
          user_id: d.user_id,
          telefone: d.numero_whatsapp,
          status: 'pendente'
        }));

        for (let i = 0; i < enviosInsert.length; i += 100) {
          const batch = enviosInsert.slice(i, i + 100);
          await client
            .from('campanhas_whatsapp_envios')
            .upsert(batch, { onConflict: 'campanha_id,user_id', ignoreDuplicates: true });
        }
      }

      const { data: enviosPendentes } = await client
        .from('campanhas_whatsapp_envios')
        .select('*')
        .eq('campanha_id', campanhaId)
        .in('status', ['pendente', 'falha']);

      if (!enviosPendentes || enviosPendentes.length === 0) {
        await recalcularContadores(client, campanhaId);
        return 0;
      }

      const instanceUrl = Deno.env.get('WHATSAPP_INSTANCE_URL');
      const apiToken = Deno.env.get('WHATSAPP_API_TOKEN');
      const accountSecret = Deno.env.get('WHATSAPP_ACCOUNT_SECRET');

      if (!instanceUrl || !apiToken) {
        await client.from('campanhas_whatsapp').update({ status: 'falha' }).eq('id', campanhaId);
        throw new Error('Credenciais WhatsApp não configuradas');
      }

      const sendTextUrl = `${instanceUrl}/token/${apiToken}/send-text`;
      const prefixo = `📢 *Picotinho*\n\n`;

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
                message: prefixo + campanhaData.mensagem,
                delayTyping: 3
              })
            });

            if (response.ok) {
              await client
                .from('campanhas_whatsapp_envios')
                .update({ status: 'enviado', enviado_em: new Date().toISOString(), erro: null })
                .eq('id', envio.id);
              console.log(`✅ [CAMPANHA] Enviado para ${envio.telefone}`);
            } else {
              const errBody = await response.text();
              await client
                .from('campanhas_whatsapp_envios')
                .update({ status: 'falha', erro: `HTTP ${response.status}: ${errBody}` })
                .eq('id', envio.id);
              console.error(`❌ [CAMPANHA] Falha ${envio.telefone}: HTTP ${response.status}`);
            }
          } catch (err: any) {
            await client
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

      await recalcularContadores(client, campanhaId);
      return enviosPendentes.length;
    }

  } catch (error: any) {
    console.error('❌ [CAMPANHA] Erro:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

// Recalcula contadores usando COUNT real por status
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

// Finaliza o registro de disparo com contadores reais
async function finalizarDisparo(client: any, campanhaId: string, disparoId: string | undefined) {
  if (!disparoId) return;

  const { data: contagem } = await client
    .from('campanhas_whatsapp_envios')
    .select('status')
    .eq('campanha_id', campanhaId);

  const enviados = (contagem || []).filter((e: any) => e.status === 'enviado').length;
  const falhas = (contagem || []).filter((e: any) => e.status === 'falha').length;
  const total = (contagem || []).length;

  let statusDisparo: string;
  if (total === 0) statusDisparo = 'falha';
  else if (falhas === 0) statusDisparo = 'concluida';
  else if (enviados === 0) statusDisparo = 'falha';
  else statusDisparo = 'concluida_parcial';

  await client
    .from('campanhas_whatsapp_disparos')
    .update({
      concluido_em: new Date().toISOString(),
      total_enviados: enviados,
      total_falhas: falhas,
      total_destinatarios: total,
      status: statusDisparo
    })
    .eq('id', disparoId);
}
