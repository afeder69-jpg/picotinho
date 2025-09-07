import "https://deno.land/x/xhr@0.1.0/mod.ts";
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
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { notaImagemId, imageUrl } = await req.json();

    if (!notaImagemId || !imageUrl) {
      return new Response(
        JSON.stringify({ error: 'Parâmetros obrigatórios ausentes' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`🔍 Processando imagem com IA: ${notaImagemId}`);

    // Processar com OpenAI Vision
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `Você é um especialista em extrair dados de notas fiscais brasileiras. 
            Analise a imagem e extraia as seguintes informações em formato JSON:
            {
              "estabelecimento": {
                "nome": "nome do estabelecimento",
                "cnpj": "CNPJ (apenas números)",
                "endereco": "endereço completo"
              },
              "compra": {
                "valor_total": número total da compra,
                "forma_pagamento": "forma de pagamento",
                "numero": "número da nota",
                "serie": "série",
                "data_emissao": "data da compra no formato DD/MM/AAAA",
                "chave_acesso": "chave de acesso NFCe (44 dígitos)"
              },
              "produtos": [
                {
                  "nome": "nome do produto",
                  "codigo": "código do produto",
                  "quantidade": quantidade,
                  "unidade": "unidade de medida",
                  "precoUnitario": preço unitário,
                  "precoTotal": preço total do item,
                  "categoria": "categoria do produto"
                }
              ]
            }
            Se não conseguir identificar algum campo, use null. Para valores monetários, use apenas números.
            Categorize os produtos usando: Laticínios, Bebidas, Padaria, Mercearia, Hortifruti, Carnes, Higiene, Limpeza, Congelados, Outros.`
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Extraia os dados desta nota fiscal:'
              },
              {
                type: 'image_url',
                image_url: {
                  url: imageUrl
                }
              }
            ]
          }
        ],
        max_tokens: 2000
      }),
    });

    const aiData = await response.json();
    console.log('OpenAI response:', aiData);

    if (!aiData.choices?.[0]?.message?.content) {
      throw new Error('Failed to process image with OpenAI');
    }

    let extractedData;
    try {
      const jsonMatch = aiData.choices[0].message.content.match(/\{[\s\S]*\}/);
      const jsonString = jsonMatch ? jsonMatch[0] : aiData.choices[0].message.content;
      extractedData = JSON.parse(jsonString);
    } catch (e) {
      console.error('Failed to parse OpenAI response:', e);
      throw new Error('Invalid response format from OpenAI');
    }

    // 🔍 ANÁLISE DE NOTA FISCAL (decisão da IA)
    const analisarSeENotaFiscal = (dados: any) => {
      // Critério 1: Chave de acesso com 44 dígitos
      const chaveAcesso = dados?.compra?.chave_acesso || 
                         dados?.chave_acesso ||
                         dados?.access_key;
      const chaveValida = chaveAcesso && chaveAcesso.replace(/[^\d]/g, '').length === 44;
      
      // Critério 2: CNPJ do estabelecimento
      const cnpj = dados?.estabelecimento?.cnpj || 
                   dados?.store_cnpj ||
                   dados?.cnpj;
      const cnpjValido = cnpj && cnpj.replace(/[^\d]/g, '').length >= 14;
      
      // Critério 3: Data da compra
      const dataCompra = dados?.compra?.data_emissao || 
                        dados?.purchase_date ||
                        dados?.data_compra;
      const dataValida = dataCompra && dataCompra.length > 0;
      
      // Critério 4: Valor total
      const valorTotal = dados?.compra?.valor_total || 
                        dados?.total_amount ||
                        dados?.valor_total;
      const valorValido = valorTotal && typeof valorTotal === 'number' && valorTotal > 0;
      
      // Critério 5: Lista de itens com pelo menos 1 produto válido
      const itens = dados?.produtos || dados?.items || dados?.itens || [];
      const itemValido = itens.length > 0 && itens.some(item => 
        (item.nome || item.name || item.descricao) && 
        (item.quantidade || item.quantity) && 
        (item.precoUnitario || item.unit_price || item.precoTotal || item.total_price || item.valor_unitario || item.valor_total)
      );
      
      console.log("🔍 ANÁLISE DE NOTA FISCAL:");
      console.log(`   - Chave de acesso (44 dígitos): ${chaveValida ? '✅' : '❌'} (${chaveAcesso || 'não encontrada'})`);
      console.log(`   - CNPJ estabelecimento: ${cnpjValido ? '✅' : '❌'} (${cnpj || 'não encontrado'})`);
      console.log(`   - Data da compra: ${dataValida ? '✅' : '❌'} (${dataCompra || 'não encontrada'})`);
      console.log(`   - Valor total: ${valorValido ? '✅' : '❌'} (${valorTotal || 'não encontrado'})`);
      console.log(`   - Itens válidos: ${itemValido ? '✅' : '❌'} (${itens.length} itens encontrados)`);
      
      const isNotaFiscal = chaveValida && cnpjValido && dataValida && valorValido && itemValido;
      
      if (!isNotaFiscal) {
        let motivos = [];
        if (!chaveValida) motivos.push('chave de acesso inválida');
        if (!cnpjValido) motivos.push('CNPJ inválido');
        if (!dataValida) motivos.push('data inválida');
        if (!valorValido) motivos.push('valor total inválido');
        if (!itemValido) motivos.push('itens inválidos');
        
        return {
          isNotaFiscal: false,
          reason: `Não atende aos critérios de nota fiscal: ${motivos.join(', ')}`
        };
      }
      
      return {
        isNotaFiscal: true,
        reason: 'Documento atende aos critérios de nota fiscal válida'
      };
    };

    // Analisar se é nota fiscal
    const analise = analisarSeENotaFiscal(extractedData);
    console.log(`🤖 DECISÃO DA IA: ${analise.isNotaFiscal ? 'É NOTA FISCAL' : 'NÃO É NOTA FISCAL'}`);
    console.log(`📝 Motivo: ${analise.reason}`);

    if (!analise.isNotaFiscal) {
      console.log("❌ ARQUIVO NÃO É UMA NOTA FISCAL VÁLIDA - Cancelando processamento");
      
      // Buscar o registro para obter o caminho correto do arquivo
      const { data: notaImagem } = await supabase
        .from('notas_imagens')
        .select('imagem_path')
        .eq('id', notaImagemId)
        .single();
      
      // Excluir arquivo do storage
      if (notaImagem?.imagem_path) {
        try {
          const { error: deleteError } = await supabase.storage
            .from('receipts')
            .remove([notaImagem.imagem_path]);
          
          if (deleteError) {
            console.error("⚠️ Erro ao excluir arquivo do storage:", deleteError);
          } else {
            console.log("🗑️ Arquivo excluído do storage");
          }
        } catch (deleteStorageError) {
          console.error("⚠️ Erro ao excluir do storage:", deleteStorageError);
        }
      }

      // Excluir registro do banco
      try {
        const { error: deleteDbError } = await supabase
          .from('notas_imagens')
          .delete()
          .eq('id', notaImagemId);
        
        if (deleteDbError) {
          console.error("⚠️ Erro ao excluir registro do banco:", deleteDbError);
        } else {
          console.log("🗑️ Registro excluído do banco");
        }
      } catch (deleteDbError) {
        console.error("⚠️ Erro ao excluir do banco:", deleteDbError);
      }

      return new Response(JSON.stringify({
        success: false,
        isNotaFiscal: false,
        reason: analise.reason,
        message: "❌ Esse arquivo não é uma nota fiscal válida. O Picotinho não aceita esse tipo de documento. Por favor, envie apenas nota ou cupom fiscal em PDF, XML ou imagem."
      }), { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log("✅ NOTA FISCAL VALIDADA - Prosseguindo com o processamento");

    // Salvar dados extraídos e chamar process-receipt-full
    const { error: updateError } = await supabase
      .from('notas_imagens')
      .update({
        dados_extraidos: extractedData,
        updated_at: new Date().toISOString()
      })
      .eq('id', notaImagemId);

    if (updateError) {
      console.error('❌ Erro ao salvar dados extraídos:', updateError);
      throw updateError;
    }

    console.log('✅ Dados da IA salvos com sucesso');

    // Chamar process-receipt-full para processamento completo
    console.log('🔄 Chamando process-receipt-full para processamento completo...');
    const { data: fullProcessData, error: fullProcessError } = await supabase.functions.invoke('process-receipt-full', {
      body: { imagemId: notaImagemId }
    });

    if (fullProcessError) {
      console.error('❌ Erro no processamento completo:', fullProcessError);
      throw fullProcessError;
    }

    console.log('✅ Processamento completo concluído');

    return new Response(JSON.stringify({ 
      success: true,
      isNotaFiscal: true,
      reason: analise.reason,
      message: 'Nota fiscal processada e estoque atualizado com sucesso!'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Erro geral:', error);
    return new Response(JSON.stringify({ 
      error: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});