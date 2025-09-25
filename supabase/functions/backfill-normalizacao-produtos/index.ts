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
      erro: error instanceof Error ? error.message : 'Erro desconhecido'
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
    .select('id, produto_nome, produto_hash_normalizado, produto_nome_normalizado, user_id, quantidade, created_at, updated_at')
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
      
      // Sempre atualizar quando forçar reprocessamento, ou quando hash mudou
      const hashMudou = normalizacao.produto_hash_normalizado !== registro.produto_hash_normalizado;
      const nomeMudou = normalizacao.produto_nome_normalizado !== registro.produto_nome_normalizado;
      
      if (forcarReprocessamento || hashMudou || nomeMudou) {
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
  // Chamar a função de normalização IA-3
  const response = await supabase.functions.invoke('normalizar-produto-ia3', {
    body: { nomeOriginal }
  });

  if (response.error) {
    throw new Error(`Erro na normalização: ${response.error.message}`);
  }

  return response.data;
}

async function consolidarEstoque(supabase: any) {
  console.log('[CONSOLIDACAO] Iniciando consolidação de produtos duplicados...');
  
  // Buscar todos os produtos com hash normalizado
  const { data: todosProdutos, error } = await supabase
    .from('estoque_app')
    .select('*')
    .not('produto_hash_normalizado', 'is', null);
    
  if (error) {
    console.error('[CONSOLIDACAO] Erro ao buscar produtos:', error);
    return;
  }
  
  console.log(`[CONSOLIDACAO] Total de produtos encontrados: ${todosProdutos?.length || 0}`);
  
  // Agrupar produtos por hash e user_id usando JavaScript
  const grupos = new Map();
  
  for (const produto of todosProdutos || []) {
    // Só agrupar produtos que têm hash válido
    if (produto.produto_hash_normalizado && produto.produto_hash_normalizado.length > 10) {
      const chave = `${produto.produto_hash_normalizado}-${produto.user_id}`;
      if (!grupos.has(chave)) {
        grupos.set(chave, []);
      }
      grupos.get(chave).push(produto);
    }
  }
  
  console.log(`[CONSOLIDACAO] Total de grupos únicos: ${grupos.size}`);
  
  // Processar apenas grupos com duplicatas
  let consolidacoes = 0;
  for (const [chave, produtos] of grupos.entries()) {
    if (produtos.length <= 1) {
      continue; // Sem duplicatas para este grupo
    }
    
    try {
      console.log(`[CONSOLIDACAO] Consolidando ${produtos.length} produtos: ${produtos[0].produto_nome_normalizado || produtos[0].produto_nome}`);
      console.log(`[CONSOLIDACAO] Produtos originais: ${produtos.map((p: any) => p.produto_nome).join(' + ')}`);
      
      // Ordenar por data de criação (mais antigo primeiro, mas usar o melhor nome normalizado)
      produtos.sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      
      // Manter o produto com o melhor nome normalizado como principal
      const produtoPrincipal = produtos.find((p: any) => p.produto_nome_normalizado && p.produto_nome_normalizado.trim() !== '') || produtos[0];
      const outrosProdutos = produtos.filter((p: any) => p.id !== produtoPrincipal.id);
      
      // Somar quantidades
      const quantidadeTotal = produtos.reduce((total: number, p: any) => total + (p.quantidade || 0), 0);
      const precoMaisRecente = produtos.reduce((ultimoPreco: any, p: any) => 
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
      
      // Deletar produtos duplicados
      if (outrosProdutos.length > 0) {
        const idsParaDeletar = outrosProdutos.map((p: any) => p.id);
        const { error: deleteError } = await supabase
          .from('estoque_app')
          .delete()
          .in('id', idsParaDeletar);
          
        if (deleteError) {
          console.error(`[CONSOLIDACAO] Erro ao deletar duplicatas:`, deleteError);
        } else {
          console.log(`[CONSOLIDACAO] ✅ Consolidado: ${produtoPrincipal.produto_nome_normalizado || produtoPrincipal.produto_nome} (${quantidadeTotal} ${produtoPrincipal.unidade_medida})`);
        }
      }
      
      consolidacoes++;
      
    } catch (error) {
      console.error(`[CONSOLIDACAO] Erro ao processar grupo:`, error);
    }
  }
  
  console.log(`[CONSOLIDACAO] 🎉 Consolidação concluída: ${consolidacoes} grupos de produtos consolidados`);
}