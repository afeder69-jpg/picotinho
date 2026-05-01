/**
 * 🔁 RETRY de NFC-e/NFe pendentes na SEFAZ (contingência)
 *
 * Cron a cada 5 minutos: busca notas com status_processamento='pendente_consulta'
 * e proxima_tentativa_em <= now(), tenta reprocessar via process-url-nota
 * (que reaproveita InfoSimples / fallback). Aplica backoff: 10m, 30m, 1h, 6h, 24h, 24h.
 * Após 6 tentativas sem sucesso, marca como 'falha_definitiva_consulta'.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  classificarRespostaInfoSimples,
  calcularProximaTentativa,
  MAX_TENTATIVAS_PENDENTE,
} from '../_shared/nfcePendente.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOTE_MAX = 25;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const agora = new Date().toISOString();
  const { data: pendentes, error } = await supabase
    .from('notas_imagens')
    .select('id, usuario_id, chave_acesso, imagem_url, tentativas_consulta, historico_tentativas')
    .eq('status_processamento', 'pendente_consulta')
    .lte('proxima_tentativa_em', agora)
    .neq('excluida', true)
    .limit(LOTE_MAX);

  if (error) {
    console.error('❌ Erro ao buscar pendentes:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500,
    });
  }

  console.log(`🔁 Retry de ${pendentes?.length || 0} notas pendentes`);
  const resultados: any[] = [];

  for (const nota of pendentes || []) {
    const tentativaAtual = (nota.tentativas_consulta || 0) + 1;
    let resultadoStatus: 'autorizada' | 'pendente' | 'erro' = 'erro';
    let motivoTent = '';
    let detalheTent = '';

    try {
      // Determinar modelo a partir da chave (bytes 20-22)
      const chave = String(nota.chave_acesso || '');
      const modelo = chave.substring(20, 22);
      const fnAlvo = modelo === '55' ? 'process-nfe-infosimples' : 'process-nfce-infosimples';

      // Invocar diretamente a função InfoSimples sobre a MESMA nota (mesmo id),
      // evitando o gargalo de duplicidade do process-url-nota.
      const { data, error: invokeError } = await supabase.functions.invoke(fnAlvo, {
        body: {
          chaveAcesso: chave,
          userId: nota.usuario_id,
          notaImagemId: nota.id,
        },
      });

      if (invokeError) {
        motivoTent = 'invoke_error';
        detalheTent = String(invokeError?.message || invokeError);
      } else if (data?.pendente === true) {
        resultadoStatus = 'pendente';
        motivoTent = data.motivo || 'sefaz_nao_autorizada';
        detalheTent = data.detalhe || data.message || '';
      } else if (data?.success) {
        resultadoStatus = 'autorizada';
        motivoTent = 'autorizada';
      } else {
        motivoTent = data?.error || 'falha_desconhecida';
        detalheTent = data?.message || '';
      }
    } catch (e: any) {
      motivoTent = 'exception';
      detalheTent = String(e?.message || e);
    }

    const historico = Array.isArray(nota.historico_tentativas) ? nota.historico_tentativas : [];
    historico.push({
      tentativa: tentativaAtual,
      em: new Date().toISOString(),
      resultado: resultadoStatus,
      motivo: motivoTent,
      detalhe: detalheTent,
    });

    if (resultadoStatus === 'autorizada') {
      // process-nfce/nfe-infosimples já fez UPDATE para 'aguardando_estoque'.
      // Apenas registramos histórico/tentativas/finaliza consulta.
      await supabase.from('notas_imagens').update({
        consulta_finalizada_em: new Date().toISOString(),
        proxima_tentativa_em: null,
        tentativas_consulta: tentativaAtual,
        historico_tentativas: historico,
        updated_at: new Date().toISOString(),
      }).eq('id', nota.id);
      resultados.push({ id: nota.id, status: 'autorizada' });
      continue;
    }

    // Ainda pendente OU erro: agendar próxima tentativa ou falha definitiva
    const proxima = calcularProximaTentativa(tentativaAtual);
    if (!proxima || tentativaAtual >= MAX_TENTATIVAS_PENDENTE) {
      await supabase.from('notas_imagens').update({
        status_processamento: 'falha_definitiva_consulta',
        consulta_finalizada_em: new Date().toISOString(),
        motivo_pendencia: motivoTent,
        proxima_tentativa_em: null,
        tentativas_consulta: tentativaAtual,
        historico_tentativas: historico,
        updated_at: new Date().toISOString(),
      }).eq('id', nota.id);

      // 🔔 Notificação de falha definitiva (idempotente via UNIQUE (nota_id, tipo))
      try {
        const { error: notifErr } = await supabase
          .from('notificacoes_usuario')
          .insert({
            usuario_id: nota.usuario_id,
            tipo: 'nota_falha_definitiva',
            titulo: 'Nota não pôde ser processada',
            mensagem: 'Não conseguimos processar sua nota fiscal após várias tentativas. Ela pode não ter sido autorizada pela SEFAZ. Recomendamos verificar com o estabelecimento.',
            nota_id: nota.id,
          });
        if (notifErr && !String(notifErr.message || '').includes('uniq_notificacao_nota_tipo')) {
          console.warn('⚠️ Falha ao inserir notificação:', notifErr.message);
        }
      } catch (e: any) {
        console.warn('⚠️ Exceção ao inserir notificação:', e?.message);
      }

      resultados.push({ id: nota.id, status: 'falha_definitiva' });
    } else {
      await supabase.from('notas_imagens').update({
        status_processamento: 'pendente_consulta',
        motivo_pendencia: motivoTent,
        proxima_tentativa_em: proxima.toISOString(),
        tentativas_consulta: tentativaAtual,
        historico_tentativas: historico,
        updated_at: new Date().toISOString(),
      }).eq('id', nota.id);
      resultados.push({ id: nota.id, status: 'reagendada', proxima: proxima.toISOString() });
    }
  }

  return new Response(JSON.stringify({ ok: true, processadas: resultados.length, resultados }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
  });
});
