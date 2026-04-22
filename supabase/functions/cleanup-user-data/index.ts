import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0';
import { requireUser, AuthError, authErrorResponse, corsHeaders } from "../_shared/auth.ts";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // 🔐 Wave 1 hotfix: require authenticated user; userId derived from JWT only.
  let authUserId: string;
  let authUserEmail: string | null = null;
  try {
    const ctx = await requireUser(req);
    authUserId = ctx.userId;
    authUserEmail = ctx.email;
  } catch (authErr) {
    return authErrorResponse(authErr);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // userId is ALWAYS the authenticated caller. Body is ignored for safety.
    const userId = authUserId;
    const email = authUserEmail ?? '(jwt)';
    console.log(`🧹 Iniciando limpeza completa para: ${email} (${userId})`);

    const cleanupResults: any[] = [];

    // 2. Limpar tabelas na ordem correta (considerando foreign keys)
    
    // Receipt items
    const { error: receiptItemsError } = await supabase
      .from('receipt_items')
      .delete()
      .in('receipt_id', 
        supabase.from('receipts').select('id').eq('user_id', userId)
      );
    
    if (receiptItemsError) console.error('Erro ao deletar receipt_items:', receiptItemsError);
    cleanupResults.push({ table: 'receipt_items', status: receiptItemsError ? 'erro' : 'ok' });

    // Receipts
    const { error: receiptsError } = await supabase
      .from('receipts')
      .delete()
      .eq('user_id', userId);
    
    if (receiptsError) console.error('Erro ao deletar receipts:', receiptsError);
    cleanupResults.push({ table: 'receipts', status: receiptsError ? 'erro' : 'ok' });

    // Notas imagens
    const { error: notasImagensError } = await supabase
      .from('notas_imagens')
      .delete()
      .eq('usuario_id', userId);
    
    if (notasImagensError) console.error('Erro ao deletar notas_imagens:', notasImagensError);
    cleanupResults.push({ table: 'notas_imagens', status: notasImagensError ? 'erro' : 'ok' });

    // Notas
    const { error: notasError } = await supabase
      .from('notas')
      .delete()
      .eq('user_id', userId);
    
    if (notasError) console.error('Erro ao deletar notas:', notasError);
    cleanupResults.push({ table: 'notas', status: notasError ? 'erro' : 'ok' });

    // Estoque app
    const { error: estoqueError } = await supabase
      .from('estoque_app')
      .delete()
      .eq('user_id', userId);
    
    if (estoqueError) console.error('Erro ao deletar estoque_app:', estoqueError);
    cleanupResults.push({ table: 'estoque_app', status: estoqueError ? 'erro' : 'ok' });

    // Preços atuais usuário
    const { error: precosUsuarioError } = await supabase
      .from('precos_atuais_usuario')
      .delete()
      .eq('user_id', userId);
    
    if (precosUsuarioError) console.error('Erro ao deletar precos_atuais_usuario:', precosUsuarioError);
    cleanupResults.push({ table: 'precos_atuais_usuario', status: precosUsuarioError ? 'erro' : 'ok' });

    // Produtos
    const { error: produtosError } = await supabase
      .from('produtos')
      .delete()
      .eq('user_id', userId);
    
    if (produtosError) console.error('Erro ao deletar produtos:', produtosError);
    cleanupResults.push({ table: 'produtos', status: produtosError ? 'erro' : 'ok' });

    // Mercados
    const { error: mercadosError } = await supabase
      .from('mercados')
      .delete()
      .eq('user_id', userId);
    
    if (mercadosError) console.error('Erro ao deletar mercados:', mercadosError);
    cleanupResults.push({ table: 'mercados', status: mercadosError ? 'erro' : 'ok' });

    // Categorias
    const { error: categoriasError } = await supabase
      .from('categorias')
      .delete()
      .eq('user_id', userId);
    
    if (categoriasError) console.error('Erro ao deletar categorias:', categoriasError);
    cleanupResults.push({ table: 'categorias', status: categoriasError ? 'erro' : 'ok' });

    // Configurações usuário (manter apenas resetar raio padrão)
    const { error: configError } = await supabase
      .from('configuracoes_usuario')
      .update({ raio_busca_km: 5.0 })
      .eq('usuario_id', userId);
    
    if (configError) console.error('Erro ao resetar configuracoes_usuario:', configError);
    cleanupResults.push({ table: 'configuracoes_usuario', status: configError ? 'erro' : 'resetado' });

    console.log('✅ Limpeza completa finalizada');
    console.log('📊 Resultados:', cleanupResults);

    return new Response(
      JSON.stringify({ 
        success: true,
        message: `Limpeza completa realizada para ${email}`,
        userId: userId,
        resultados: cleanupResults,
        resumo: {
          total_tabelas: cleanupResults.length,
          sucesso: cleanupResults.filter(r => r.status === 'ok' || r.status === 'resetado').length,
          erros: cleanupResults.filter(r => r.status === 'erro').length
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Erro na limpeza:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});