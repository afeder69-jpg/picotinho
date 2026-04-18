/**
 * 🏁 FINALIZE NOTA ESTOQUE
 *
 * Edge function de orquestração server-side para finalizar uma nota
 * (após dados_extraidos preenchido) sem depender do navegador.
 *
 * FLUXO:
 *  1. Lock atômico via UPDATE ... WHERE status_processamento IN ('aguardando_estoque','pendente')
 *     RETURNING para garantir que só um worker processa por vez.
 *  2. Invoca validate-receipt com fromInfoSimples=true (sem PDF).
 *  3. Em caso de aprovação, invoca process-receipt-full (que já é idempotente
 *     por nota_id — limpa estoque parcial antes de reinserir).
 *  4. Atualiza status_processamento para 'processada' ou 'erro'.
 *
 * IDEMPOTÊNCIA:
 *  - process-receipt-full já executa DELETE FROM estoque_app WHERE nota_id = finalNotaId
 *    antes de reinserir os itens (verificado em auditoria, linha 1410).
 *  - Esta função apenas orquestra; não duplica esse cleanup.
 *
 * USO:
 *  - Chamada por process-nfe-infosimples / process-nfce-infosimples após gravar dados_extraidos.
 *  - Chamada por retry-notas-pendentes (cron) para notas presas.
 *  - Chamada manualmente por "Tentar de novo" no frontend.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_TENTATIVAS = 5;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  let notaImagemId: string | null = null;

  try {
    const body = await req.json();
    notaImagemId = body.notaImagemId;

    if (!notaImagemId) {
      return new Response(
        JSON.stringify({ error: 'notaImagemId é obrigatório' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    console.log(`🏁 [FINALIZE] Iniciando para nota ${notaImagemId}`);

    // 1. LOCK ATÔMICO — só prossegue se status estiver elegível e não excedeu tentativas
    const { data: lockedRows, error: lockError } = await supabase
      .from('notas_imagens')
      .update({
        status_processamento: 'processando',
        processing_started_at: new Date().toISOString(),
        tentativas_finalizacao: 0, // será incrementado abaixo se necessário
      })
      .eq('id', notaImagemId)
      .in('status_processamento', ['pendente', 'aguardando_estoque', 'erro'])
      .lt('tentativas_finalizacao', MAX_TENTATIVAS)
      .select('id, usuario_id, dados_extraidos, imagem_url, pdf_url, tentativas_finalizacao')
      .maybeSingle();

    if (lockError) {
      console.error('❌ [FINALIZE] Erro no lock:', lockError);
      throw lockError;
    }

    if (!lockedRows) {
      // Já está sendo processada por outro worker, ou já foi processada, ou excedeu tentativas
      console.log(`⏭️ [FINALIZE] Nota ${notaImagemId} não elegível para processamento (já em processamento, concluída ou excedeu tentativas).`);
      return new Response(
        JSON.stringify({ success: false, skipped: true, reason: 'not_eligible' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // Incrementar contador de tentativas (separado para preservar valor atual)
    const novaTentativa = (lockedRows.tentativas_finalizacao || 0) + 1;
    await supabase
      .from('notas_imagens')
      .update({ tentativas_finalizacao: novaTentativa })
      .eq('id', notaImagemId);

    const userId = lockedRows.usuario_id;
    const dadosExtraidos = lockedRows.dados_extraidos;

    if (!dadosExtraidos) {
      throw new Error('Nota sem dados_extraidos — não pode ser finalizada');
    }

    console.log(`🔒 [FINALIZE] Lock obtido. Tentativa ${novaTentativa}/${MAX_TENTATIVAS}`);

    // 2. VALIDATE-RECEIPT (fromInfoSimples=true, sem PDF)
    console.log(`🔍 [FINALIZE] Invocando validate-receipt...`);
    const { data: validacaoResp, error: validacaoErr } = await supabase.functions.invoke(
      'validate-receipt',
      {
        body: {
          notaImagemId,
          userId,
          fromInfoSimples: true,
        },
      }
    );

    if (validacaoErr) {
      throw new Error(`validate-receipt falhou: ${validacaoErr.message}`);
    }

    if (validacaoResp?.shouldDelete || validacaoResp?.approved === false) {
      console.log(`🛑 [FINALIZE] Validação rejeitou: ${validacaoResp?.reason || 'sem motivo'}`);
      await supabase
        .from('notas_imagens')
        .update({
          status_processamento: 'erro',
          erro_mensagem: validacaoResp?.message || validacaoResp?.reason || 'Nota rejeitada na validação',
        })
        .eq('id', notaImagemId);

      return new Response(
        JSON.stringify({ success: false, rejected: true, reason: validacaoResp?.reason }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // 3. PROCESS-RECEIPT-FULL (já idempotente por nota_id)
    // Liberar processing_started_at antes de invocar — process-receipt-full
    // adquire seu próprio lock atômico via UPDATE ... WHERE processing_started_at IS NULL.
    await supabase
      .from('notas_imagens')
      .update({ processing_started_at: null })
      .eq('id', notaImagemId);

    console.log(`📦 [FINALIZE] Invocando process-receipt-full...`);
    const { data: processResp, error: processErr } = await supabase.functions.invoke(
      'process-receipt-full',
      {
        body: {
          notaId: notaImagemId,
          force: true,
        },
      }
    );

    if (processErr) {
      throw new Error(`process-receipt-full falhou: ${processErr.message}`);
    }

    if (processResp?.error) {
      throw new Error(`process-receipt-full retornou erro: ${processResp.error}`);
    }

    if (processResp?.already_processing) {
      throw new Error('process-receipt-full não conseguiu adquirir lock (already_processing)');
    }

    // 4. SUCESSO
    await supabase
      .from('notas_imagens')
      .update({
        status_processamento: 'processada',
        erro_mensagem: null,
      })
      .eq('id', notaImagemId);

    console.log(`✅ [FINALIZE] Nota ${notaImagemId} finalizada com sucesso`);

    return new Response(
      JSON.stringify({ success: true, notaImagemId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error: any) {
    console.error('❌ [FINALIZE] Erro:', error);

    // Marca como erro mas mantém elegível para retry se ainda há tentativas
    if (notaImagemId) {
      const { data: nota } = await supabase
        .from('notas_imagens')
        .select('tentativas_finalizacao')
        .eq('id', notaImagemId)
        .maybeSingle();

      const tentativas = nota?.tentativas_finalizacao || 0;
      const statusFinal = tentativas >= MAX_TENTATIVAS ? 'erro' : 'aguardando_estoque';

      await supabase
        .from('notas_imagens')
        .update({
          status_processamento: statusFinal,
          erro_mensagem: error.message?.substring(0, 500) || 'Erro desconhecido',
        })
        .eq('id', notaImagemId);

      console.log(`📌 [FINALIZE] Status definido como '${statusFinal}' (tentativas: ${tentativas}/${MAX_TENTATIVAS})`);
    }

    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
