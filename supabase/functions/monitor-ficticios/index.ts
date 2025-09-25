import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase environment variables");
    }

    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.7.1");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('🔍 INICIANDO MONITORAMENTO DE DADOS FICTÍCIOS');

    // BUSCAR NOTAS COM DADOS SUSPEITOS
    const { data: notasSuspeitas, error } = await supabase
      .from('notas_imagens')
      .select('id, usuario_id, dados_extraidos, created_at')
      .eq('processada', true)
      .not('dados_extraidos', 'is', null);

    if (error) {
      throw error;
    }

    let problemas_detectados = 0;
    let notas_bloqueadas = [];

    // DEFINIR PADRÕES FICTÍCIOS
    const nomesFicticios = [
      'SUPERMERCADO EXEMPLO',
      'ESTABELECIMENTO TESTE', 
      'LOJA EXEMPLO',
      'EMPRESA EXEMPLO',
      'MERCADO TESTE'
    ];

    const cnpjsFicticios = [
      '12345678000190',
      '11111111111111', 
      '00000000000000',
      '12.345.678/0001-90',
      '33191234567890001234567890001234567890123456' // chave sequencial
    ];

    // PRODUTOS CLARAMENTE FICTÍCIOS
    const produtosFicticios = [
      'Mamão Formosa Granel',
      'Arroz Branco 5kg',
      'Feijão Preto 1kg',
      'Leite Integral 1L',
      'Pão Francês 10 unidades',
      'Cerveja Lata 350ml',
      'Sabão em Pó 1kg'
    ];

    for (const nota of notasSuspeitas) {
      let eh_ficticia = false;
      let motivos = [];

      const dados = nota.dados_extraidos;
      
      // VERIFICAR ESTABELECIMENTO FICTÍCIO
      const nomeEstab = dados?.estabelecimento?.nome?.toUpperCase() || '';
      const cnpjEstab = dados?.estabelecimento?.cnpj || '';
      
      if (nomesFicticios.includes(nomeEstab)) {
        eh_ficticia = true;
        motivos.push(`Nome fictício: ${nomeEstab}`);
      }

      if (cnpjsFicticios.includes(cnpjEstab)) {
        eh_ficticia = true;
        motivos.push(`CNPJ fictício: ${cnpjEstab}`);
      }

      // VERIFICAR PRODUTOS FICTÍCIOS
      const itens = dados?.itens || [];
      const produtosSuspeitos = itens.filter((item: any) => 
        produtosFicticios.includes(item.descricao)
      );

      if (produtosSuspeitos.length === itens.length && itens.length === 7) {
        // Se TODOS os 7 produtos são da lista fictícia padrão
        eh_ficticia = true;
        motivos.push('Lista completa de produtos fictícios detectada');
      }

      // VERIFICAR VALORES MUITO REDONDOS (suspeito)
      const valoresRedondos = itens.filter((item: any) => 
        item.valor_unitario % 1 === 0 || 
        item.valor_unitario.toString().endsWith('.5') ||
        item.valor_unitario.toString().endsWith('.00')
      );

      if (valoresRedondos.length === itens.length && itens.length > 3) {
        eh_ficticia = true;
        motivos.push('Todos os preços são valores redondos (suspeito)');
      }

      if (eh_ficticia) {
        problemas_detectados++;
        
        console.log(`🚨 NOTA FICTÍCIA DETECTADA: ${nota.id}`);
        console.log(`📝 Motivos: ${motivos.join(', ')}`);
        
        // MARCAR COMO NÃO PROCESSADA E EXCLUIR DADOS
        await supabase
          .from('notas_imagens')
          .update({
            processada: false,
            dados_extraidos: null,
            updated_at: new Date().toISOString()
          })
          .eq('id', nota.id);

        // REMOVER DO ESTOQUE PRODUTOS FICTÍCIOS
        await supabase
          .from('estoque_app')
          .delete()
          .eq('nota_id', nota.id);

        notas_bloqueadas.push({
          nota_id: nota.id,
          usuario_id: nota.usuario_id,
          motivos: motivos,
          data_deteccao: new Date().toISOString()
        });
      }
    }

    console.log(`✅ MONITORAMENTO CONCLUÍDO`);
    console.log(`📊 Notas analisadas: ${notasSuspeitas.length}`);
    console.log(`🚨 Problemas detectados: ${problemas_detectados}`);

    return new Response(
      JSON.stringify({
        success: true,
        notas_analisadas: notasSuspeitas.length,
        problemas_detectados,
        notas_bloqueadas,
        timestamp: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error('❌ Erro no monitoramento:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Erro desconhecido'
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});