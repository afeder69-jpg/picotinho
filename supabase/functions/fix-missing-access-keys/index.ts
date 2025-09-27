import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')!;

    if (!openaiApiKey) {
      throw new Error('OpenAI API key não configurada');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('🔧 Iniciando correção GLOBAL de chaves de acesso em notas existentes...');

    // Buscar TODAS as notas processadas sem chave de acesso (TODOS OS USUÁRIOS)
    const { data: notasSemChave, error } = await supabase
      .from('notas_imagens')
      .select('id, dados_extraidos, imagem_url, usuario_id')
      .eq('processada', true)
      .is('dados_extraidos->chave_acesso', null);

    if (error) {
      throw new Error(`Erro ao buscar notas: ${error.message}`);
    }

    if (!notasSemChave || notasSemChave.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: 'Todas as notas já possuem chave de acesso',
        processadas: 0
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`📝 Encontradas ${notasSemChave.length} notas sem chave de acesso (TODOS OS USUÁRIOS)`);

    let processadas = 0;
    let comChaveEncontrada = 0;

    // Prompt da IA-1 para extrair apenas a chave de acesso
    const extractKeyPrompt = `Analise este documento e extraia APENAS a chave de acesso da nota fiscal.

Procure por uma sequência de 44 dígitos consecutivos (pode ter espaços, pontos ou quebras de linha).
A chave de acesso é única e identifica cada nota fiscal.

Se encontrar a chave, normalize:
- O → 0
- I ou l → 1  
- B → 8
- Remova espaços, pontos e quebras

Responda APENAS com um JSON simples:
{
  "chave_encontrada": "sequência de 44 dígitos" ou null
}`;

    for (const nota of notasSemChave) {
      try {
        console.log(`🔍 Processando nota ${nota.id}...`);

        if (!nota.imagem_url) {
          console.log(`⚠️ Nota ${nota.id} sem URL de imagem, pulando...`);
          continue;
        }

        // Analisar com OpenAI Vision para extrair chave
        const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
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
                content: extractKeyPrompt
              },
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text: 'Extraia a chave de acesso desta nota fiscal:'
                  },
                  {
                    type: 'image_url',
                    image_url: {
                      url: nota.imagem_url
                    }
                  }
                ]
              }
            ],
            max_tokens: 150
          }),
        });

        if (!openaiResponse.ok) {
          console.error(`❌ Erro OpenAI para nota ${nota.id}:`, openaiResponse.status);
          continue;
        }

        const openaiResult = await openaiResponse.json();
        const analysisText = openaiResult.choices[0]?.message?.content || '{}';
        
        let analysis;
        try {
          const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
          const jsonText = jsonMatch ? jsonMatch[0] : analysisText;
          analysis = JSON.parse(jsonText);
        } catch (parseError) {
          console.error(`❌ Erro ao parsear resposta para nota ${nota.id}:`, parseError);
          continue;
        }

        if (analysis.chave_encontrada && analysis.chave_encontrada.length === 44) {
          // Salvar chave no banco de dados
          const dadosAtualizados = {
            ...nota.dados_extraidos,
            chave_acesso: analysis.chave_encontrada
          };

          const { error: updateError } = await supabase
            .from('notas_imagens')
            .update({ dados_extraidos: dadosAtualizados })
            .eq('id', nota.id);

          if (updateError) {
            console.error(`❌ Erro ao salvar chave para nota ${nota.id}:`, updateError);
          } else {
            comChaveEncontrada++;
            console.log(`✅ Chave salva para nota ${nota.id}: ...${analysis.chave_encontrada.slice(-6)}`);
          }
        } else {
          console.log(`⚠️ Nota ${nota.id}: chave não encontrada ou inválida`);
        }

        processadas++;
        
        // Delay para não sobrecarregar a API
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error) {
        console.error(`❌ Erro ao processar nota ${nota.id}:`, error);
      }
    }

    console.log(`🎉 Correção concluída: ${processadas} notas processadas, ${comChaveEncontrada} chaves encontradas`);

    return new Response(JSON.stringify({
      success: true,
      message: `Correção concluída com sucesso`,
      notasProcessadas: processadas,
      chavesEncontradas: comChaveEncontrada,
      notasTotal: notasSemChave.length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('❌ Erro na correção:', error);
    return new Response(JSON.stringify({
      error: 'Erro interno do servidor',
      details: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
})