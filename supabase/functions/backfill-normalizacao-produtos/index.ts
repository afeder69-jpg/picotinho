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

    const { limite = 100, tabela = 'estoque_app', forcarReprocessamento = false, consolidar = false } = await req.json();

    console.log(`[BACKFILL-NORMALIZACAO] Iniciando backfill para tabela: ${tabela}, limite: ${limite}`);

    let processados = 0;
    let atualizados = 0;
    let erros = 0;

    if (tabela === 'estoque_app') {
      const resultado = await processarEstoque(supabase, limite, forcarReprocessamento);
      processados = resultado.processados;
      atualizados = resultado.atualizados;
      erros = resultado.erros;
      
      // Se solicitada consolidação, executar após normalização
      if (consolidar) {
        console.log('[BACKFILL-CONSOLIDACAO] Iniciando consolidação do estoque...');
        await consolidarEstoque(supabase);
      }
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

async function processarEstoque(supabase: any, limite: number, forcarReprocessamento = false) {
  let processados = 0;
  let atualizados = 0;
  let erros = 0;

  // Query conditional: se forçar reprocessamento, pega todos; senão só os não normalizados
  let query = supabase
    .from('estoque_app')
    .select('id, produto_nome, produto_hash_normalizado, produto_nome_normalizado')
    .limit(limite);
    
  if (!forcarReprocessamento) {
    query = query.or('produto_hash_normalizado.is.null,produto_nome_normalizado.is.null');
  }
  
  console.log(`[BACKFILL-ESTOQUE] Forçar reprocessamento: ${forcarReprocessamento}`);
  
  const { data: registros, error } = await query;

  if (error) {
    throw new Error(`Erro ao buscar registros: ${error.message}`);
  }

  console.log(`[BACKFILL-ESTOQUE] Encontrados ${registros?.length || 0} registros para processar`);

  for (const registro of registros || []) {
    try {
      processados++;
      
      // Chamar a função de normalização
      const normalizacao = await normalizarProduto(supabase, registro.produto_nome);
      
      // Verificar se houve mudança real ou se está forçando reprocessamento
      if (forcarReprocessamento || normalizacao.produto_hash_normalizado !== registro.produto_hash_normalizado) {
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

async function consolidarEstoque(supabase: any) {
  console.log('[CONSOLIDACAO] Iniciando consolidação de produtos duplicados...');
  
  // Buscar produtos agrupados por hash normalizado
  const { data: grupos, error } = await supabase
    .from('estoque_app')
    .select('produto_hash_normalizado, user_id')
    .not('produto_hash_normalizado', 'is', null)
    .group('produto_hash_normalizado, user_id');
    
  if (error) {
    console.error('[CONSOLIDACAO] Erro ao buscar grupos:', error);
    return;
  }
  
  for (const grupo of grupos || []) {
    try {
      // Buscar todos os produtos do mesmo hash para o mesmo usuário
      const { data: produtos, error: produtosError } = await supabase
        .from('estoque_app')
        .select('*')
        .eq('produto_hash_normalizado', grupo.produto_hash_normalizado)
        .eq('user_id', grupo.user_id)
        .order('created_at', { ascending: true });
        
      if (produtosError || !produtos || produtos.length <= 1) {
        continue; // Sem duplicatas para este grupo
      }
      
      console.log(`[CONSOLIDACAO] Consolidando ${produtos.length} produtos: ${produtos[0].produto_nome_normalizado}`);
      
      // Manter o primeiro produto e somar quantidades
      const produtoPrincipal = produtos[0];
      const quantidadeTotal = produtos.reduce((total, p) => total + (p.quantidade || 0), 0);
      const precoMaisRecente = produtos.reduce((ultimoPreco, p) => 
        p.updated_at > ultimoPreco.updated_at ? p : ultimoPreco
      ).preco_unitario_ultimo;
      
      // Atualizar produto principal com dados consolidados
      const { error: updateError } = await supabase
        .from('estoque_app')
        .update({
          quantidade: quantidadeTotal,
          preco_unitario_ultimo: precoMaisRecente,
          updated_at: new Date().toISOString()
        })
        .eq('id', produtoPrincipal.id);
        
      if (updateError) {
        console.error(`[CONSOLIDACAO] Erro ao atualizar produto principal:`, updateError);
        continue;
      }
      
      // Deletar produtos duplicados (todos exceto o primeiro)
      const idsParaDeletar = produtos.slice(1).map(p => p.id);
      if (idsParaDeletar.length > 0) {
        const { error: deleteError } = await supabase
          .from('estoque_app')
          .delete()
          .in('id', idsParaDeletar);
          
        if (deleteError) {
          console.error(`[CONSOLIDACAO] Erro ao deletar duplicatas:`, deleteError);
        } else {
          console.log(`[CONSOLIDACAO] Consolidado: ${produtoPrincipal.produto_nome_normalizado} (${quantidadeTotal} ${produtoPrincipal.unidade_medida})`);
        }
      }
      
    } catch (error) {
      console.error(`[CONSOLIDACAO] Erro ao processar grupo:`, error);
    }
  }
  
  console.log('[CONSOLIDACAO] Consolidação concluída');
}