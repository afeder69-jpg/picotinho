import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { limite = 100, tabela = 'estoque_app' } = await req.json();

    console.log(`[BACKFILL-NORMALIZACAO] Iniciando backfill para tabela: ${tabela}, limite: ${limite}`);

    let processados = 0;
    let atualizados = 0;
    let erros = 0;

    if (tabela === 'estoque_app') {
      const resultado = await processarEstoque(supabase, limite);
      processados = resultado.processados;
      atualizados = resultado.atualizados;
      erros = resultado.erros;
    } else if (tabela === 'precos_atuais') {
      const resultado = await processarPrecosAtuais(supabase, limite);
      processados = resultado.processados;
      atualizados = resultado.atualizados;
      erros = resultado.erros;
    } else if (tabela === 'precos_atuais_usuario') {
      const resultado = await processarPrecosUsuario(supabase, limite);
      processados = resultado.processados;
      atualizados = resultado.atualizados;
      erros = resultado.erros;
    } else {
      throw new Error(`Tabela não suportada: ${tabela}`);
    }

    console.log(`[BACKFILL-NORMALIZACAO] Finalizado: ${processados} processados, ${atualizados} atualizados, ${erros} erros`);

    return new Response(JSON.stringify({
      sucesso: true,
      tabela,
      processados,
      atualizados,
      erros,
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[BACKFILL-NORMALIZACAO] Erro:', error);
    return new Response(JSON.stringify({
      sucesso: false,
      erro: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

async function processarEstoque(supabase: any, limite: number) {
  let processados = 0;
  let atualizados = 0;
  let erros = 0;

  // Buscar registros do estoque que ainda não foram normalizados
  const { data: registros, error } = await supabase
    .from('estoque_app')
    .select('id, produto_nome, produto_hash_normalizado')
    .or('produto_hash_normalizado.is.null,produto_nome_normalizado.is.null')
    .limit(limite);

  if (error) {
    throw new Error(`Erro ao buscar registros: ${error.message}`);
  }

  console.log(`[BACKFILL-ESTOQUE] Encontrados ${registros?.length || 0} registros para processar`);

  for (const registro of registros || []) {
    try {
      processados++;
      
      // Chamar a função de normalização
      const normalizacao = await normalizarProduto(supabase, registro.produto_nome);
      
      // Verificar se houve mudança real
      if (normalizacao.produto_hash_normalizado !== registro.produto_hash_normalizado) {
        // Atualizar registro com dados normalizados
        const { error: updateError } = await supabase
          .from('estoque_app')
          .update({
            produto_nome_normalizado: normalizacao.produto_nome_normalizado,
            nome_base: normalizacao.nome_base,
            marca: normalizacao.marca,
            tipo_embalagem: normalizacao.tipo_embalagem,
            qtd_valor: normalizacao.qtd_valor,
            qtd_unidade: normalizacao.qtd_unidade,
            qtd_base: normalizacao.qtd_base,
            granel: normalizacao.granel,
            produto_hash_normalizado: normalizacao.produto_hash_normalizado,
            updated_at: new Date().toISOString()
          })
          .eq('id', registro.id);

        if (updateError) {
          console.error(`[BACKFILL-ESTOQUE] Erro ao atualizar ${registro.id}:`, updateError);
          erros++;
        } else {
          atualizados++;
          console.log(`[BACKFILL-ESTOQUE] Atualizado: ${registro.produto_nome} -> ${normalizacao.produto_nome_normalizado}`);
        }
      }
    } catch (error) {
      console.error(`[BACKFILL-ESTOQUE] Erro ao processar ${registro.produto_nome}:`, error);
      erros++;
    }
  }

  return { processados, atualizados, erros };
}

async function processarPrecosAtuais(supabase: any, limite: number) {
  let processados = 0;
  let atualizados = 0;
  let erros = 0;

  const { data: registros, error } = await supabase
    .from('precos_atuais')
    .select('id, produto_nome, produto_hash_normalizado')
    .or('produto_hash_normalizado.is.null,produto_nome_normalizado.is.null')
    .limit(limite);

  if (error) {
    throw new Error(`Erro ao buscar registros: ${error.message}`);
  }

  console.log(`[BACKFILL-PRECOS] Encontrados ${registros?.length || 0} registros para processar`);

  for (const registro of registros || []) {
    try {
      processados++;
      
      const normalizacao = await normalizarProduto(supabase, registro.produto_nome);
      
      if (normalizacao.produto_hash_normalizado !== registro.produto_hash_normalizado) {
        const { error: updateError } = await supabase
          .from('precos_atuais')
          .update({
            produto_nome_normalizado: normalizacao.produto_nome_normalizado,
            nome_base: normalizacao.nome_base,
            marca: normalizacao.marca,
            tipo_embalagem: normalizacao.tipo_embalagem,
            qtd_valor: normalizacao.qtd_valor,
            qtd_unidade: normalizacao.qtd_unidade,
            qtd_base: normalizacao.qtd_base,
            granel: normalizacao.granel,
            produto_hash_normalizado: normalizacao.produto_hash_normalizado
          })
          .eq('id', registro.id);

        if (updateError) {
          console.error(`[BACKFILL-PRECOS] Erro ao atualizar ${registro.id}:`, updateError);
          erros++;
        } else {
          atualizados++;
        }
      }
    } catch (error) {
      console.error(`[BACKFILL-PRECOS] Erro ao processar ${registro.produto_nome}:`, error);
      erros++;
    }
  }

  return { processados, atualizados, erros };
}

async function processarPrecosUsuario(supabase: any, limite: number) {
  let processados = 0;
  let atualizados = 0;
  let erros = 0;

  const { data: registros, error } = await supabase
    .from('precos_atuais_usuario')
    .select('id, produto_nome, produto_hash_normalizado')
    .or('produto_hash_normalizado.is.null,produto_nome_normalizado.is.null')
    .limit(limite);

  if (error) {
    throw new Error(`Erro ao buscar registros: ${error.message}`);
  }

  console.log(`[BACKFILL-PRECOS-USUARIO] Encontrados ${registros?.length || 0} registros para processar`);

  for (const registro of registros || []) {
    try {
      processados++;
      
      const normalizacao = await normalizarProduto(supabase, registro.produto_nome);
      
      if (normalizacao.produto_hash_normalizado !== registro.produto_hash_normalizado) {
        const { error: updateError } = await supabase
          .from('precos_atuais_usuario')
          .update({
            produto_nome_normalizado: normalizacao.produto_nome_normalizado,
            nome_base: normalizacao.nome_base,
            marca: normalizacao.marca,
            tipo_embalagem: normalizacao.tipo_embalagem,
            qtd_valor: normalizacao.qtd_valor,
            qtd_unidade: normalizacao.qtd_unidade,
            qtd_base: normalizacao.qtd_base,
            granel: normalizacao.granel,
            produto_hash_normalizado: normalizacao.produto_hash_normalizado,
            updated_at: new Date().toISOString()
          })
          .eq('id', registro.id);

        if (updateError) {
          console.error(`[BACKFILL-PRECOS-USUARIO] Erro ao atualizar ${registro.id}:`, updateError);
          erros++;
        } else {
          atualizados++;
        }
      }
    } catch (error) {
      console.error(`[BACKFILL-PRECOS-USUARIO] Erro ao processar ${registro.produto_nome}:`, error);
      erros++;
    }
  }

  return { processados, atualizados, erros };
}

async function normalizarProduto(supabase: any, nomeOriginal: string) {
  // Chamar a função de normalização IA-2
  const response = await supabase.functions.invoke('normalizar-produto-ia2', {
    body: { nomeOriginal }
  });

  if (response.error) {
    throw new Error(`Erro na normalização: ${response.error.message}`);
  }

  return response.data;
}