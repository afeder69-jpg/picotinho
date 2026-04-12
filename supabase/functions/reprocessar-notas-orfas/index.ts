import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BATCH_SIZE = 10;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Validar JWT do chamador (apenas masters)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Autenticação necessária' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Token inválido' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: isMaster } = await supabase.rpc('has_role', {
      _user_id: user.id,
      _role: 'master',
    });
    if (!isMaster) {
      return new Response(JSON.stringify({ error: 'Apenas masters podem executar' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const dryRun = body.dry_run === true;

    // Buscar todas as notas órfãs: processada=true, tem dados_extraidos, mas 0 itens no estoque
    const { data: notasOrfas, error: queryError } = await supabase.rpc('buscar_notas_orfas_para_reprocessamento');

    // Se a RPC não existe, fazer query direta
    let notas: any[] = [];
    if (queryError) {
      console.log('⚠️ RPC não encontrada, usando query direta');
      const { data: allNotas, error: err2 } = await supabase
        .from('notas_imagens')
        .select('id, usuario_id, dados_extraidos, created_at')
        .eq('processada', true)
        .not('dados_extraidos', 'is', null)
        .eq('excluida', false)
        .order('created_at', { ascending: true });

      if (err2) throw err2;

      // Filtrar as que não têm itens no estoque
      for (const nota of (allNotas || [])) {
        // Pular notas com erro terminal
        if (nota.dados_extraidos?.erro) continue;

        const { count } = await supabase
          .from('estoque_app')
          .select('id', { count: 'exact', head: true })
          .eq('nota_id', nota.id);

        if (count === 0) {
          notas.push(nota);
        }
      }
    } else {
      notas = notasOrfas || [];
    }

    console.log(`📋 Encontradas ${notas.length} notas órfãs para reprocessamento`);

    if (dryRun) {
      const resumo = notas.map((n: any) => {
        const itens = n.dados_extraidos?.produtos || n.dados_extraidos?.itens || [];
        return {
          nota_id: n.id,
          user_id: n.usuario_id,
          itens_extraidos: itens.length,
          created_at: n.created_at,
        };
      });
      return new Response(JSON.stringify({
        dry_run: true,
        total_notas_orfas: notas.length,
        notas: resumo,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Processar em lotes
    const resultados: any[] = [];
    let totalItensInseridos = 0;
    let totalSucesso = 0;
    let totalFalhas = 0;

    for (let i = 0; i < notas.length; i += BATCH_SIZE) {
      const lote = notas.slice(i, i + BATCH_SIZE);
      console.log(`🔄 Processando lote ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(notas.length / BATCH_SIZE)}`);

      for (const nota of lote) {
        const itensExtraidos = nota.dados_extraidos?.produtos || nota.dados_extraidos?.itens || [];
        const resultado: any = {
          nota_id: nota.id,
          user_id: nota.usuario_id,
          itens_extraidos: itensExtraidos.length,
          itens_inseridos: 0,
          status: 'pendente',
          erro: null,
        };

        try {
          // Resetar processada para false para permitir reprocessamento
          const { error: resetError } = await supabase
            .from('notas_imagens')
            .update({ processada: false, updated_at: new Date().toISOString() })
            .eq('id', nota.id);

          if (resetError) {
            throw new Error(`Erro ao resetar nota: ${resetError.message}`);
          }

          // Chamar process-receipt-full para reprocessar
          const { data: processResult, error: processError } = await supabase.functions.invoke(
            'process-receipt-full',
            {
              body: {
                notaImagemId: nota.id,
                userId: nota.usuario_id,
                force: true,
              },
            }
          );

          if (processError) {
            throw new Error(`Erro no process-receipt-full: ${processError.message}`);
          }

          // Verificar quantos itens foram inseridos
          const { count: itensNoEstoque } = await supabase
            .from('estoque_app')
            .select('id', { count: 'exact', head: true })
            .eq('nota_id', nota.id);

          resultado.itens_inseridos = itensNoEstoque || 0;
          resultado.status = (itensNoEstoque || 0) > 0 ? 'sucesso' : 'sem_itens';
          totalItensInseridos += resultado.itens_inseridos;

          if (resultado.status === 'sucesso') {
            totalSucesso++;
          } else {
            totalFalhas++;
            resultado.erro = 'Nenhum item inserido após reprocessamento';
          }

          console.log(`  ✅ Nota ${nota.id}: ${resultado.itens_inseridos} itens inseridos`);
        } catch (error) {
          resultado.status = 'erro';
          resultado.erro = error.message;
          totalFalhas++;
          console.error(`  ❌ Nota ${nota.id}: ${error.message}`);
        }

        resultados.push(resultado);
      }
    }

    const relatorio = {
      timestamp: new Date().toISOString(),
      executado_por: user.id,
      total_notas_processadas: resultados.length,
      total_sucesso: totalSucesso,
      total_falhas: totalFalhas,
      total_itens_inseridos: totalItensInseridos,
      notas: resultados,
    };

    console.log(`📊 Relatório final: ${totalSucesso} sucesso, ${totalFalhas} falhas, ${totalItensInseridos} itens inseridos`);

    return new Response(JSON.stringify(relatorio), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('❌ [REPROCESSAR-ORFAS] Erro:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
