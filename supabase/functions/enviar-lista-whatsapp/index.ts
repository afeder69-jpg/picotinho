import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EnviarListaRequest {
  lista_titulo: string;
  modo_ativo: string;
  dados_comparacao: {
    nome: string;
    total: number;
    economia?: number;
    percentualEconomia?: number;
    mercados: Array<{
      nome: string;
      total: number;
      produtos: Array<{
        produto_nome: string;
        quantidade: number;
        unidade_medida: string;
        preco_unitario: number;
      }>;
    }>;
  };
  telefone_id?: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get('Authorization')?.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Não autenticado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const body: EnviarListaRequest = await req.json();

    let telefone;
    if (body.telefone_id) {
      const { data, error } = await supabase
        .from('whatsapp_telefones_autorizados')
        .select('*')
        .eq('usuario_id', user.id)
        .eq('verificado', true)
        .eq('ativo', true)
        .eq('id', body.telefone_id)
        .maybeSingle();
      
      if (error) throw error;
      telefone = data;
    } else {
      const { data, error } = await supabase
        .from('whatsapp_telefones_autorizados')
        .select('*')
        .eq('usuario_id', user.id)
        .eq('verificado', true)
        .eq('ativo', true)
        .eq('tipo', 'principal')
        .maybeSingle();
      
      if (error) throw error;
      telefone = data;
    }

    if (!telefone) {
      return new Response(JSON.stringify({ 
        error: 'Nenhum telefone WhatsApp verificado encontrado' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // O banco já garante formato 55 + DDD + número (13 dígitos) via trigger
    const numeroParaEnvio = telefone.numero_whatsapp;

    const mensagem = formatarListaCompras(body);

    const instanceUrl = Deno.env.get('WHATSAPP_INSTANCE_URL');
    const apiToken = Deno.env.get('WHATSAPP_API_TOKEN');
    const accountSecret = Deno.env.get('WHATSAPP_ACCOUNT_SECRET');

    if (!instanceUrl || !apiToken || !accountSecret) {
      return new Response(JSON.stringify({ 
        error: 'Configurações Z-API não encontradas' 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Z-API recebe o número COM prefixo 55
    const sendTextUrl = `${instanceUrl}/token/${apiToken}/send-text`;
    
    console.log(`📱 Enviando lista para ${numeroParaEnvio}`);
    console.log(`📝 Mensagem (primeiros 200 chars): ${mensagem.substring(0, 200)}...`);

    const whatsappResponse = await fetch(sendTextUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Client-Token': accountSecret,
      },
      body: JSON.stringify({
        phone: numeroParaEnvio,
        message: mensagem,
      }),
    });

    const responseData = await whatsappResponse.text();
    console.log(`📤 Resposta Z-API (${whatsappResponse.status}): ${responseData}`);

    if (!whatsappResponse.ok) {
      throw new Error(`Z-API retornou erro: ${responseData}`);
    }

    try {
      const jsonResponse = JSON.parse(responseData);
      if (jsonResponse.error) {
        throw new Error(`Z-API erro: ${jsonResponse.message || jsonResponse.error}`);
      }
    } catch (parseError) {
      // Se não for JSON, considerar como sucesso
    }

    return new Response(JSON.stringify({ 
      success: true,
      message: 'Lista enviada com sucesso para o WhatsApp!'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('❌ Erro ao enviar lista:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'Erro ao enviar lista',
      success: false
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
};

function formatarListaCompras(dados: EnviarListaRequest): string {
  const { lista_titulo, modo_ativo, dados_comparacao } = dados;
  
  const modoNome = modo_ativo === 'otimizado' ? 'Otimizada' : dados_comparacao.nome;
  
  let mensagem = `🛒 *Lista de Compras: ${lista_titulo}*\n\n`;
  mensagem += `💰 *Opção ${modoNome}*\n`;
  mensagem += `*Total: R$ ${dados_comparacao.total.toFixed(2)}*\n\n`;
  
  if (dados_comparacao.economia && dados_comparacao.economia > 0) {
    mensagem += `🎯 *Economia de R$ ${dados_comparacao.economia.toFixed(2)}*\n`;
    mensagem += `   (${dados_comparacao.percentualEconomia?.toFixed(1)}% mais barato)\n\n`;
  }
  
  mensagem += `━━━━━━━━━━━━━━━━━━━━\n\n`;
  
  dados_comparacao.mercados.forEach((mercado, index) => {
    mensagem += `🏪 *${mercado.nome}*\n`;
    mensagem += `💵 Subtotal: R$ ${mercado.total.toFixed(2)}\n\n`;
    
    mercado.produtos.forEach((produto) => {
      mensagem += `  ☐ ${produto.produto_nome}\n`;
      mensagem += `     ${produto.quantidade} ${produto.unidade_medida} × R$ ${produto.preco_unitario.toFixed(2)}\n`;
      mensagem += `     = R$ ${(produto.quantidade * produto.preco_unitario).toFixed(2)}\n\n`;
    });
    
    if (index < dados_comparacao.mercados.length - 1) {
      mensagem += `━━━━━━━━━━━━━━━━━━━━\n\n`;
    }
  });
  
  mensagem += `━━━━━━━━━━━━━━━━━━━━\n`;
  mensagem += `✅ *TOTAL GERAL: R$ ${dados_comparacao.total.toFixed(2)}*\n\n`;
  mensagem += `📱 _Lista gerada pelo Picotinho_`;
  
  return mensagem;
}

serve(handler);
